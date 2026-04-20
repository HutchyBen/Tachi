import {
	type BMSCourseDocument,
	type ChartDocument,
	computeFolderSlug,
	type FolderDocument,
	type GoalDocument,
	type QuestDocument,
	type QuestlineDocument,
	type SeedFolderRow,
	type SongDocument,
	type TableDocument,
	type V3Game,
} from "tachi-common";
/* eslint-disable no-await-in-loop */
import type {
	Database,
	GameGroup,
	NewBmsCourseLookup,
	NewChart,
	NewFolder,
	NewGoal,
	NewQuest,
	NewQuestline,
	NewQuestlineQuest,
	NewSong,
	NewTable,
	NewTableFolder,
	Game as PgGame,
} from "tachi-db";

import { ComputeChartStabilityChecksum } from "#game-implementations/utils/derivation-checksum";
import { rebuildFolderChartLookup } from "#lib/folders/rebuild-folder-chart-lookup";
import fs from "fs";
import { type Insertable, type Kysely, sql } from "kysely";
import path from "path";

// ── Seed types ─────────────────────────────────────────────────────────────

type SeedSong = { id: string; legacySongID?: number } & Omit<SongDocument, "id">;
// songID is now a hex string (migrated from the old integer FK).
type SeedChart = {
	id: string;
	legacyChartID?: string;
	songID: string;
} & Omit<ChartDocument, "songID">;
// After 3-migrate-folders-tables.ts: folderID → legacyFolderID + id, game+playtype → game.
// After 5-folders-to-sql-queries.ts: `where` is the SQL predicate (no leading WHERE).
type SeedFolder = {
	game: string;
	id: string;
	legacyFolderID?: string;
	/** URL slug; becomes `folder.slug`. */
	slug?: string;
	/** Chart version filter; becomes `folder.version_filter`. */
	versionFilter?: Array<string>;
	/** SQL WHERE body from `5-folders-to-sql-queries.ts`; becomes `folder.where`. */
	where: string;
} & Omit<FolderDocument, "data" | "folderID" | "game" | "playtype" | "type">;
// After 3-migrate-folders-tables.ts: tableID → legacyTableID + id, game+playtype → game.
// `folders` entries are folder slugs (unique per game); see `6-tables-folder-refs-to-slugs.ts`.
type SeedTable = {
	folders: Array<string>;
	game: string;
	id: string;
	legacyTableID?: string;
} & Omit<TableDocument, "folders" | "game" | "playtype" | "tableID">;

const INSERT_CHUNK = 500;

/** Resolves chart version filter from seed `versionFilter`. */
function seedFolderVersionFilter(f: SeedFolder): Array<string> | null {
	if (f.versionFilter && f.versionFilter.length > 0) {
		return f.versionFilter;
	}

	return null;
}

/** Canonical folder slug for a seed row (matches `folder.slug` in Postgres). */
function seedFolderResolvedSlug(f: SeedFolder): string {
	const seedRow: SeedFolderRow = {
		game: f.game,
		id: f.id,
		title: f.title,
		versionFilter: f.versionFilter,
		where: f.where,
		slug: f.slug,
	};

	return f.slug ?? computeFolderSlug(seedRow);
}

/** Maps `game\\0slug` → folder id for resolving `tables.json` folder refs. */
function buildFolderGameSlugToIdMap(folders: Array<SeedFolder>): Map<string, string> {
	const m = new Map<string, string>();

	for (const f of folders) {
		const slug = seedFolderResolvedSlug(f);
		const key = `${f.game}\0${slug}`;

		if (m.has(key)) {
			throw new Error(
				`Duplicate folder slug ${JSON.stringify(slug)} for game ${JSON.stringify(f.game)}`,
			);
		}

		m.set(key, f.id);
	}

	return m;
}

function readJsonSeed<T>(seedsDir: string, filename: string): Array<T> {
	return JSON.parse(fs.readFileSync(path.join(seedsDir, filename), "utf-8")) as Array<T>;
}

async function chunkedDeletePg(
	pg: Kysely<Database>,
	table: keyof Database,
	column: string,
	ids: ReadonlyArray<string>,
): Promise<void> {
	for (let i = 0; i < ids.length; i = i + INSERT_CHUNK) {
		const chunk = ids.slice(i, i + INSERT_CHUNK);

		await (pg.deleteFrom(table as never) as any).where(column, "in", chunk).execute();
	}
}

async function batchIgnorePg<T extends keyof Database>(
	pg: Kysely<Database>,
	table: T,
	rows: ReadonlyArray<Insertable<Database[T]>>,
): Promise<void> {
	if (rows.length === 0) {
		return;
	}

	for (let i = 0; i < rows.length; i = i + INSERT_CHUNK) {
		const chunk = rows.slice(i, i + INSERT_CHUNK);

		await pg
			.insertInto(table)
			.values(chunk as never)
			.onConflict((oc) => oc.doNothing())
			.execute();
	}
}

async function upsertSongsForGameGroup(
	pg: Kysely<Database>,
	gameGroup: GameGroup,
	songs: Array<SeedSong>,
): Promise<void> {
	const songRows: Array<NewSong> = [];

	for (const s of songs) {
		if (!s.id) {
			throw new Error(
				`Song ${gameGroup}:${s.legacySongID} is missing an id. Run 1-migrate-to-pg-style.ts first.`,
			);
		}

		const searchTerms = s.searchTerms ?? [];
		const altTitles = s.altTitles ?? [];

		songRows.push({
			id: s.id,
			legacy_id:
				s.legacySongID ??
				(() => {
					throw new Error(`Song ${gameGroup}:${s.id} is missing legacySongID.`);
				})(),
			game_group: gameGroup,
			title: s.title,
			artist: s.artist,
			search_terms: searchTerms,
			alt_titles: altTitles,
			data: JSON.stringify(s.data),
			fts_document: [...searchTerms, ...altTitles].filter(Boolean).join(" "),
		});
	}

	for (let i = 0; i < songRows.length; i = i + INSERT_CHUNK) {
		const chunk = songRows.slice(i, i + INSERT_CHUNK);

		await pg
			.insertInto("song")
			.values(chunk)
			.onConflict((oc) =>
				oc.column("id").doUpdateSet({
					title: sql`excluded.title`,
					artist: sql`excluded.artist`,
					data: sql`excluded.data`,
					search_terms: sql`excluded.search_terms`,
					alt_titles: sql`excluded.alt_titles`,
					fts_document: sql`excluded.fts_document`,
				}),
			)
			.execute();
	}
}

async function upsertChartsForPgGame(
	pg: Kysely<Database>,
	game: V3Game,
	charts: Array<SeedChart>,
): Promise<void> {
	if (charts.length === 0) {
		return;
	}

	const chartRows: Array<NewChart> = [];

	for (const c of charts) {
		if (!c.id) {
			throw new Error(
				`Chart ${c.legacyChartID ?? "(unknown)"}` +
					` (${game}) is missing an id. Run 1-migrate-to-pg-style.ts first.`,
			);
		}

		if (!c.legacyChartID) {
			throw new Error(
				`Chart ${c.id} (${game}) is missing legacyChartID. Run 1-migrate-to-pg-style.ts first.`,
			);
		}

		const checksum = ComputeChartStabilityChecksum(game, c as unknown as ChartDocument);

		chartRows.push({
			id: c.id,
			legacy_id: c.legacyChartID,
			game: game,
			song_id: c.songID,
			level: c.level,
			level_num: c.levelNum,
			is_primary: c.isPrimary,
			difficulty: c.difficulty,
			versions: (c.versions ?? []).map(String),
			data: JSON.stringify(c.data),
			derivation_checksum: checksum,
		});
	}

	for (let i = 0; i < chartRows.length; i = i + INSERT_CHUNK) {
		const chunk = chartRows.slice(i, i + INSERT_CHUNK);

		await pg
			.insertInto("chart")
			.values(chunk)
			.onConflict((oc) =>
				oc.column("id").doUpdateSet({
					level: sql`excluded.level`,
					level_num: sql`excluded.level_num`,
					is_primary: sql`excluded.is_primary`,
					difficulty: sql`excluded.difficulty`,
					versions: sql`excluded.versions`,
					data: sql`excluded.data`,
					derivation_checksum: sql`excluded.derivation_checksum`,
				}),
			)
			.execute();
	}
}

export type ImportSeedsSubsetOptions = {
	gameGroups: GameGroup[];
	/** When true (default), load chart rows whose `songID` is in the loaded song set. */
	includeCharts?: boolean;
	maxSongsPerGame: number;
};

/**
 * Loads a bounded slice of real seed JSON (songs + optional charts) for tests or tooling.
 */
export async function importSeedsSubset(
	pg: Kysely<Database>,
	seedsDir: string,
	options: ImportSeedsSubsetOptions,
): Promise<void> {
	const { maxSongsPerGame, gameGroups, includeCharts = true } = options;
	const loadedSongIds = new Set<string>();

	for (const gg of gameGroups) {
		const filename = `songs-${gg}.json`;
		const filepath = path.join(seedsDir, filename);

		if (!fs.existsSync(filepath)) {
			throw new Error(`seed file not found: ${filepath}`);
		}

		const all = readJsonSeed<SeedSong>(seedsDir, filename);
		const songs = all.slice(0, maxSongsPerGame);

		await upsertSongsForGameGroup(pg, gg, songs);

		for (const s of songs) {
			loadedSongIds.add(s.id);
		}
	}

	if (!includeCharts) {
		return;
	}

	const chartFiles = fs
		.readdirSync(seedsDir)
		.filter((f) => f.startsWith("charts-") && f.endsWith(".json"));

	for (const gg of gameGroups) {
		const filesForGame = chartFiles.filter((f) => f.startsWith(`charts-${gg}`));

		for (const file of filesForGame) {
			const game = file.replace(/^charts-/u, "").replace(/\.json$/u, "") as V3Game;
			const charts = readJsonSeed<SeedChart>(seedsDir, file).filter((c) =>
				loadedSongIds.has(c.songID),
			);

			await upsertChartsForPgGame(pg, game, charts);
		}
	}
}

// ── Chart ID map ───────────────────────────────────────────────────────────

/**
 * Reads all chart seed files and returns a map of old MongoDB chartID (40-char
 * SHA1 hex) → new hex id. Used by the migration script to translate chart_id
 * FK references in scores and PBs.
 */
export function buildChartIdMap(seedsDir: string): Map<string, string> {
	const map = new Map<string, string>();

	const chartFiles = fs
		.readdirSync(seedsDir)
		.filter((f) => f.startsWith("charts-") && f.endsWith(".json"));

	for (const file of chartFiles) {
		const charts = JSON.parse(fs.readFileSync(path.join(seedsDir, file), "utf-8")) as Array<{
			id: string;
			legacyChartID?: string;
		}>;

		for (const c of charts) {
			if (c.legacyChartID && c.id) {
				map.set(c.legacyChartID, c.id);
			}
		}
	}

	return map;
}

// ── Core import logic ──────────────────────────────────────────────────────

export async function importSeeds(pg: Kysely<Database>, seedsDir: string): Promise<void> {
	const readCollection = <T>(filename: string) => readJsonSeed<T>(seedsDir, filename);

	const files = new Set<string>(fs.readdirSync(seedsDir));
	const songFiles = [...files].filter((f) => f.startsWith("songs-") && f.endsWith(".json"));
	const chartFiles: Array<string> = [...files].filter(
		(f) => f.startsWith("charts-") && f.endsWith(".json"),
	);

	// ── songs ──────────────────────────────────────────────────────────────
	{
		console.log("[song]");
		let total = 0;

		for (const file of songFiles) {
			const gameGroup = file.replace(/^songs-/u, "").replace(/\.json$/u, "") as GameGroup;
			const songs = readCollection<SeedSong>(file);

			await upsertSongsForGameGroup(pg, gameGroup, songs);

			total = total + songs.length;
			console.log(`  ${gameGroup}: ${songs.length} songs`);
		}

		console.log(`  Total: ${total}\n`);
	}

	// ── charts ─────────────────────────────────────────────────────────────
	{
		console.log("[chart]");
		let total = 0;

		for (const file of chartFiles) {
			// After 2-split-charts-by-playtype.ts the filename IS the PgGame
			// (e.g. "charts-iidx-sp.json" → "iidx-sp", "charts-chunithm.json" → "chunithm").
			const pgGame = file.replace(/^charts-/u, "").replace(/\.json$/u, "") as PgGame;
			const charts = readCollection<SeedChart>(file);

			await upsertChartsForPgGame(pg, pgGame, charts);

			total = total + charts.length;
			console.log(`  ${pgGame}: ${charts.length} charts`);
		}

		console.log(`  Total: ${total}\n`);
	}

	// ── folders ────────────────────────────────────────────────────────────
	let folderSeedList: Array<SeedFolder> | undefined;

	if (files.has("folders.json")) {
		console.log("[folder]");
		folderSeedList = readCollection<SeedFolder>("folders.json");

		const folderRows: Array<NewFolder> = folderSeedList.map((f) => {
			if (typeof f.where !== "string" || f.where.trim() === "") {
				throw new Error(
					`Folder "${f.title}" (${f.id}) has no non-empty "where" SQL string. ` +
						`Run seeds-scripts/rerunners/v3/5-folders-to-sql-queries.ts on folders.json.`,
				);
			}

			const slug = seedFolderResolvedSlug(f);

			if (f.slug !== undefined && f.slug !== slug) {
				throw new Error(
					`Folder "${f.title}" (${f.id}): folders.json slug ${JSON.stringify(f.slug)} does not match computed ${JSON.stringify(slug)}`,
				);
			}

			return {
				id: f.id,
				legacy_id:
					f.legacyFolderID ??
					(() => {
						throw new Error(
							`Folder "${f.title}" is missing legacyFolderID. Run 3-migrate-folders-tables.ts first.`,
						);
					})(),
				game: f.game as PgGame,
				inactive: f.inactive,
				title: f.title,
				slug,
				where: f.where,
				version_filter: seedFolderVersionFilter(f),
				search_terms: f.searchTerms ?? [],
			};
		});

		for (let i = 0; i < folderRows.length; i = i + INSERT_CHUNK) {
			const chunk = folderRows.slice(i, i + INSERT_CHUNK);

			await pg
				.insertInto("folder")
				.values(chunk)
				.onConflict((oc) =>
					oc.column("id").doUpdateSet({
						inactive: sql`excluded.inactive`,
						title: sql`excluded.title`,
						slug: sql`excluded.slug`,
						where: sql`excluded.where`,
						version_filter: sql`excluded.version_filter`,
						search_terms: sql`excluded.search_terms`,
					}),
				)
				.execute();
		}

		console.log(`  ${folderSeedList.length} folders\n`);
	}

	// ── tables ─────────────────────────────────────────────────────────────
	if (files.has("tables.json")) {
		console.log("[table / table_folder]");

		if (folderSeedList === undefined) {
			throw new Error(
				"tables.json requires folders.json to resolve folder slugs to ids for table_folder rows.",
			);
		}

		const folderSlugToId = buildFolderGameSlugToIdMap(folderSeedList);
		const tables = readCollection<SeedTable>("tables.json");

		const tableRows: Array<NewTable> = tables.map((t) => ({
			id: t.id,
			legacy_id:
				t.legacyTableID ??
				(() => {
					throw new Error(
						`Table "${t.title}" is missing legacyTableID. Run 3-migrate-folders-tables.ts first.`,
					);
				})(),
			game: t.game as PgGame,
			inactive: t.inactive,
			title: t.title,
			default_value: t.default,
		}));

		for (let i = 0; i < tableRows.length; i = i + INSERT_CHUNK) {
			const chunk = tableRows.slice(i, i + INSERT_CHUNK);

			await pg
				.insertInto("table")
				.values(chunk)
				.onConflict((oc) =>
					oc.column("id").doUpdateSet({
						inactive: sql`excluded.inactive`,
						title: sql`excluded.title`,
						default_value: sql`excluded.default_value`,
					}),
				)
				.execute();
		}

		const tableIds = tables.map((t) => t.id);

		await chunkedDeletePg(pg, "table_folder", "table_id", tableIds);

		const tfRows: Array<NewTableFolder> = tables.flatMap((t) =>
			t.folders.map((folderSlug, ordering) => {
				const folderId = folderSlugToId.get(`${t.game}\0${folderSlug}`);

				if (folderId === undefined) {
					throw new Error(
						`Table "${t.title}" (${t.id}): unknown folder slug ${JSON.stringify(folderSlug)} for game ${JSON.stringify(t.game)} (check tables.json / folders.json; run seeds-scripts/rerunners/v3/6-tables-folder-refs-to-slugs.ts if migrating from folder ids).`,
					);
				}

				return {
					table_id: t.id,
					folder_id: folderId,
					ordering,
				};
			}),
		);

		await batchIgnorePg(pg, "table_folder", tfRows);
		console.log(`  ${tables.length} tables, ${tfRows.length} table-folder rows\n`);
	}

	// ── bms_course_lookup ──────────────────────────────────────────────────
	if (files.has("bms-course-lookup.json")) {
		console.log("[bms_course_lookup]");
		const courses = readCollection<BMSCourseDocument>("bms-course-lookup.json");

		const courseRows: Array<NewBmsCourseLookup> = courses.map((c) => ({
			md5sums: c.md5sums,
			title: c.title,
			set: c.set as string,
			game: c.game as PgGame,
			value: c.value as string,
		}));

		await batchIgnorePg(pg, "bms_course_lookup", courseRows);
		console.log(`  ${courses.length} BMS courses\n`);
	}

	// ── goals ──────────────────────────────────────────────────────────────
	if (files.has("goals.json")) {
		console.log("[goal]");
		const goals = readCollection<GoalDocument>("goals.json");

		const goalRows: Array<NewGoal> = goals.map((g) => ({
			id: g.goalID,
			game: g.game,
			name: g.name,
			charts: JSON.stringify(g.charts),
			criteria: JSON.stringify(g.criteria),
		}));

		// Goals are never updated once created — only new ones are inserted.
		await batchIgnorePg(pg, "goal", goalRows);
		console.log(`  ${goals.length} goals\n`);
	}

	// ── quests ─────────────────────────────────────────────────────────────
	if (files.has("quests.json")) {
		console.log("[quest]");
		const quests = readCollection<QuestDocument>("quests.json");

		const questRows: Array<NewQuest> = quests.map((q) => ({
			id: q.questID,
			game: q.game,
			name: q.name,
			description: q.desc,
			quest_data: JSON.stringify(q.questData),
		}));

		for (let i = 0; i < questRows.length; i = i + INSERT_CHUNK) {
			const chunk = questRows.slice(i, i + INSERT_CHUNK);

			await pg
				.insertInto("quest")
				.values(chunk)
				.onConflict((oc) =>
					oc.column("id").doUpdateSet({
						name: sql`excluded.name`,
						description: sql`excluded.description`,
						quest_data: sql`excluded.quest_data`,
					}),
				)
				.execute();
		}

		console.log(`  ${quests.length} quests\n`);
	}

	// ── questlines ─────────────────────────────────────────────────────────
	if (files.has("questlines.json")) {
		console.log("[questline / questline_quest]");
		const questlines = readCollection<QuestlineDocument>("questlines.json");

		const qlRows: Array<NewQuestline> = questlines.map((ql) => ({
			id: ql.questlineID,
			game: ql.game,
			name: ql.name,
			description: ql.desc,
		}));

		for (let i = 0; i < qlRows.length; i = i + INSERT_CHUNK) {
			const chunk = qlRows.slice(i, i + INSERT_CHUNK);

			await pg
				.insertInto("questline")
				.values(chunk)
				.onConflict((oc) =>
					oc.column("id").doUpdateSet({
						name: sql`excluded.name`,
						description: sql`excluded.description`,
					}),
				)
				.execute();
		}

		const qlIds = questlines.map((ql) => ql.questlineID);

		await chunkedDeletePg(pg, "questline_quest", "questline_id", qlIds);

		let order = 0;
		const qlqRows: Array<NewQuestlineQuest> = questlines.flatMap((ql) => {
			order = 0;

			return ql.quests.map((questId) => ({
				questline_id: ql.questlineID,
				quest_id: questId,
				sort_order: order++,
			}));
		});

		await batchIgnorePg(pg, "questline_quest", qlqRows);
		console.log(`  ${questlines.length} questlines, ${qlqRows.length} questline-quest rows\n`);
	}

	// ── folder_chart_lookup (chart → folders cache; see rebuildFolderChartLookup) ──
	console.log("[folder_chart_lookup]");
	const lookupStats = await rebuildFolderChartLookup(pg);

	console.log(`  ${lookupStats.folderCount} folders, ${lookupStats.rowCount} lookup rows\n`);
}
