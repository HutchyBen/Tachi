import type {
	BMSCourseDocument,
	ChartDocument,
	FolderDocument,
	GoalDocument,
	QuestDocument,
	QuestlineDocument,
	SongDocument,
	TableDocument,
} from "tachi-common";
/* eslint-disable no-await-in-loop */
import type {
	Database,
	GameGroup,
	NewBmsCourseLookup,
	NewChart,
	NewChartVersion,
	NewFolder,
	NewFolderSearchTerm,
	NewGoal,
	NewQuest,
	NewQuestline,
	NewQuestlineQuest,
	NewSong,
	NewSongAltTitle,
	NewSongSearchTerm,
	NewTable,
	NewTableFolder,
	Game as PgGame,
} from "tachi-db";

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
type SeedFolder = {
	game: string;
	id: string;
	legacyFolderID?: string;
} & Omit<FolderDocument, "folderID" | "game" | "playtype">;
// After 3-migrate-folders-tables.ts: tableID → legacyTableID + id, game+playtype → game,
// folders array now contains new hex ids.
type SeedTable = {
	folders: Array<string>;
	game: string;
	id: string;
	legacyTableID?: string;
} & Omit<TableDocument, "folders" | "game" | "playtype" | "tableID">;

// ── Game helpers ───────────────────────────────────────────────────────────

const SINGLE_PT_GAMES = new Set([
	"arcaea",
	"chunithm",
	"jubeat",
	"maimai",
	"maimaidx",
	"museca",
	"ongeki",
	"popn",
	"sdvx",
	"wacca",
]);

export function toPgGame(gameGroup: string, legacyPlaytype: string): PgGame {
	if (SINGLE_PT_GAMES.has(gameGroup)) {
		return gameGroup as PgGame;
	}

	return `${gameGroup}-${legacyPlaytype.toLowerCase()}` as PgGame;
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
	const INSERT_CHUNK = 500;

	async function batchIgnore<T extends keyof Database>(
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

	// Deletes rows matching a large list of IDs by chunking the IN clause.
	async function chunkedDelete(
		table: keyof Database,
		column: string,
		ids: ReadonlyArray<string>,
	): Promise<void> {
		for (let i = 0; i < ids.length; i = i + INSERT_CHUNK) {
			const chunk = ids.slice(i, i + INSERT_CHUNK);

			await (pg.deleteFrom(table as never) as any).where(column, "in", chunk).execute();
		}
	}

	function readCollection<T>(filename: string): Array<T> {
		return JSON.parse(fs.readFileSync(path.join(seedsDir, filename), "utf-8")) as Array<T>;
	}

	const files = new Set<string>(fs.readdirSync(seedsDir));
	const songFiles = [...files].filter((f) => f.startsWith("songs-") && f.endsWith(".json"));
	const chartFiles: Array<string> = [...files].filter(
		(f) => f.startsWith("charts-") && f.endsWith(".json"),
	);

	// ── songs ──────────────────────────────────────────────────────────────
	{
		console.log("[song / song_search_term / song_alt_title]");
		let total = 0;

		for (const file of songFiles) {
			const gameGroup = file.replace(/^songs-/u, "").replace(/\.json$/u, "") as GameGroup;
			const songs = readCollection<SeedSong>(file);

			const songRows: Array<NewSong> = [];
			const searchTermRows: Array<NewSongSearchTerm> = [];
			const altTitleRows: Array<NewSongAltTitle> = [];

			for (const s of songs) {
				if (!s.id) {
					throw new Error(
						`Song ${gameGroup}:${s.legacySongID} is missing an id. Run 1-migrate-to-pg-style.ts first.`,
					);
				}

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
					data: JSON.stringify(s.data),
				});

				for (const term of s.searchTerms) {
					searchTermRows.push({ song_id: s.id, search_term: term });
				}

				for (const alt of s.altTitles) {
					altTitleRows.push({ song_id: s.id, alt_title: alt });
				}
			}

			const songIds = songs.map((s) => s.id);

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
						}),
					)
					.execute();
			}

			// Delete + reinsert child rows so removals from seeds are reflected.
			await chunkedDelete("song_search_term", "song_id", songIds);
			await chunkedDelete("song_alt_title", "song_id", songIds);

			await batchIgnore("song_search_term", searchTermRows);
			await batchIgnore("song_alt_title", altTitleRows);

			total = total + songs.length;
			console.log(`  ${gameGroup}: ${songs.length} songs`);
		}

		console.log(`  Total: ${total}\n`);
	}

	// ── charts ─────────────────────────────────────────────────────────────
	{
		console.log("[chart / chart_version]");
		let total = 0;

		for (const file of chartFiles) {
			// After 2-split-charts-by-playtype.ts the filename IS the PgGame
			// (e.g. "charts-iidx-sp.json" → "iidx-sp", "charts-chunithm.json" → "chunithm").
			const pgGame = file.replace(/^charts-/u, "").replace(/\.json$/u, "") as PgGame;
			const charts = readCollection<SeedChart>(file);

			const chartRows: Array<NewChart> = [];
			const versionRows: Array<NewChartVersion> = [];

			for (const c of charts) {
				if (!c.id) {
					throw new Error(
						`Chart ${c.legacyChartID ?? "(unknown)"}` +
							` (${pgGame}) is missing an id. Run 1-migrate-to-pg-style.ts first.`,
					);
				}

				if (!c.legacyChartID) {
					throw new Error(
						`Chart ${c.id} (${pgGame}) is missing legacyChartID. Run 1-migrate-to-pg-style.ts first.`,
					);
				}

				chartRows.push({
					id: c.id,
					legacy_id: c.legacyChartID,
					game: pgGame,
					song_id: c.songID,
					level: c.level,
					level_num: c.levelNum,
					is_primary: c.isPrimary,
					difficulty: c.difficulty,
					data: JSON.stringify(c.data),
				});

				for (const version of c.versions) {
					versionRows.push({ chart_id: c.id, version: version as string });
				}
			}

			const chartSids = charts.map((c) => c.id);

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
							data: sql`excluded.data`,
						}),
					)
					.execute();
			}

			await chunkedDelete("chart_version", "chart_id", chartSids);

			await batchIgnore("chart_version", versionRows);

			total = total + charts.length;
			console.log(`  ${pgGame}: ${charts.length} charts`);
		}

		console.log(`  Total: ${total}\n`);
	}

	// ── folders ────────────────────────────────────────────────────────────
	if (files.has("folders.json")) {
		console.log("[folder / folder_search_term]");
		const folders = readCollection<SeedFolder>("folders.json");

		const folderRows: Array<NewFolder> = folders.map((f) => ({
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
			query: JSON.stringify({ type: f.type, data: f.data }),
		}));

		for (let i = 0; i < folderRows.length; i = i + INSERT_CHUNK) {
			const chunk = folderRows.slice(i, i + INSERT_CHUNK);

			await pg
				.insertInto("folder")
				.values(chunk)
				.onConflict((oc) =>
					oc.column("id").doUpdateSet({
						inactive: sql`excluded.inactive`,
						title: sql`excluded.title`,
						query: sql`excluded.query`,
					}),
				)
				.execute();
		}

		const folderIds = folders.map((f) => f.id);

		await chunkedDelete("folder_search_term", "id", folderIds);

		const termRows: Array<NewFolderSearchTerm> = folders.flatMap((f) =>
			f.searchTerms.map((term) => ({ id: f.id, search_term: term })),
		);

		await batchIgnore("folder_search_term", termRows);
		console.log(`  ${folders.length} folders, ${termRows.length} search terms\n`);
	}

	// ── tables ─────────────────────────────────────────────────────────────
	if (files.has("tables.json")) {
		console.log("[table / table_folder]");
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

		await chunkedDelete("table_folder", "table_id", tableIds);

		const tfRows: Array<NewTableFolder> = tables.flatMap((t) =>
			t.folders.map((folderId) => ({ table_id: t.id, folder_id: folderId })),
		);

		await batchIgnore("table_folder", tfRows);
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
			playtype: c.playtype as string,
			value: c.value as string,
		}));

		await batchIgnore("bms_course_lookup", courseRows);
		console.log(`  ${courses.length} BMS courses\n`);
	}

	// ── goals ──────────────────────────────────────────────────────────────
	if (files.has("goals.json")) {
		console.log("[goal]");
		const goals = readCollection<GoalDocument>("goals.json");

		const goalRows: Array<NewGoal> = goals.map((g) => ({
			id: g.goalID,
			game: toPgGame(g.game, g.playtype),
			name: g.name,
			charts: JSON.stringify(g.charts),
			criteria: JSON.stringify(g.criteria),
		}));

		// Goals are never updated once created — only new ones are inserted.
		await batchIgnore("goal", goalRows);
		console.log(`  ${goals.length} goals\n`);
	}

	// ── quests ─────────────────────────────────────────────────────────────
	if (files.has("quests.json")) {
		console.log("[quest]");
		const quests = readCollection<QuestDocument>("quests.json");

		const questRows: Array<NewQuest> = quests.map((q) => ({
			id: q.questID,
			game: toPgGame(q.game, q.playtype),
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
			game: toPgGame(ql.game, ql.playtype),
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

		await chunkedDelete("questline_quest", "questline_id", qlIds);

		let order = 0;
		const qlqRows: Array<NewQuestlineQuest> = questlines.flatMap((ql) => {
			order = 0;

			return ql.quests.map((questId) => ({
				questline_id: ql.questlineID,
				quest_id: questId,
				sort_order: order++,
			}));
		});

		await batchIgnore("questline_quest", qlqRows);
		console.log(`  ${questlines.length} questlines, ${qlqRows.length} questline-quest rows\n`);
	}
}
