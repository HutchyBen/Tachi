import type { Game } from "tachi-db";

import { SELECT_CHART, ToChartDocument } from "#lib/db-formats/chart";
import { SELECT_SONG_DOCUMENT, ToSongDocument } from "#lib/db-formats/song";
import DB from "#services/pg/db";
import { sql, type SqlBool } from "kysely";
import {
	type Difficulties,
	type GameGroup,
	GamePTToV3,
	type GPTString,
	type integer,
	type MONGO_ChartDocument,
	type MONGO_ChartDocumentData,
	type MONGO_SongDocument,
	type Playtype,
	type Playtypes,
	V3ToGamePT,
	type Versions,
} from "tachi-common";

type ChartJoinedRow = {
	song_legacy_id: number;
} & Parameters<typeof ToChartDocument>[0] extends infer R
	? R
	: never;

function chartJoinedToDocument(
	row: { song_legacy_id: number } & ChartJoinedRow,
): MONGO_ChartDocument {
	const { song_legacy_id, ...chartRow } = row;
	return ToChartDocument(chartRow, song_legacy_id);
}

export async function FindChartWithChartID(game: GameGroup, chartID: string) {
	const row = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("song.game_group", "=", game)
		.where("chart.id", "=", chartID)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return chartJoinedToDocument(row as { song_legacy_id: number } & ChartJoinedRow);
}

/**
 * Find chart with PlaytypeDifficulty. This only finds charts that have `isPrimary` set to true.
 * If you want to find charts that are not primary, you need to use PTDFVersion.
 * @see FindChartWithPTDFVersion
 */
export async function FindChartWithPTDF<
	G extends GameGroup = GameGroup,
	P extends Playtypes[G] = Playtypes[G],
	GPT extends GPTString = GPTString,
>(game: G, songID: integer, playtype: P, difficulty: Difficulties[GPT]) {
	const v3Game = GamePTToV3(game, playtype) as Game;

	const row = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("song.game_group", "=", game)
		.where("song.legacy_id", "=", songID)
		.where("chart.game", "=", v3Game)
		.where("chart.difficulty", "=", difficulty as string)
		.where("chart.is_primary", "=", true)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return chartJoinedToDocument(row as { song_legacy_id: number } & ChartJoinedRow);
}

/**
 * Find chart with Playtype, Difficulty and a given version. This does not necessarily return a chart that has
 * `isPrimary` set.
 */
export async function FindChartWithPTDFVersion<
	G extends GameGroup = GameGroup,
	P extends Playtypes[G] = Playtypes[G],
	GPT extends GPTString = GPTString,
>(game: G, songID: integer, playtype: P, difficulty: Difficulties[GPT], version: Versions[GPT]) {
	const v3Game = GamePTToV3(game, playtype) as Game;

	const row = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("song.game_group", "=", game)
		.where("song.legacy_id", "=", songID)
		.where("chart.game", "=", v3Game)
		.where("chart.difficulty", "=", difficulty as string)
		.where(sql<boolean>`${sql.lit(String(version))} = ANY(chart.versions)`)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return chartJoinedToDocument(row as { song_legacy_id: number } & ChartJoinedRow);
}

export async function FindITGChartOnHash(hash: string) {
	const row = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("chart.game", "=", "itg-stamina" as Game)
		.where(sql<boolean>`(chart.data::jsonb->>'hashGSv3') = ${hash}`)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return chartJoinedToDocument(row as { song_legacy_id: number } & ChartJoinedRow);
}

/**
 * Find a BMS chart on either its md5sum or its sha256sum.
 * @param hash The md5 or sha256 hash to look for.
 */
export async function FindBMSChartOnHash(hash: string) {
	const row = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("song.game_group", "=", "bms")
		.where((eb) =>
			eb.or([
				sql<boolean>`(chart.data::jsonb->>'hashMD5') = ${hash}`,
				sql<boolean>`(chart.data::jsonb->>'hashSHA256') = ${hash}`,
			]),
		)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return chartJoinedToDocument(
		row as { song_legacy_id: number } & ChartJoinedRow,
	) as MONGO_ChartDocument<"bms:7K" | "bms:14K">;
}

/**
 * BMS charts for a playtype whose chart `data` has sieglinde EC or HC &gt; 0 (GPT sieglinde-charts),
 * with joined song rows (`songs[i]` matches `charts[i]`).
 */
export async function FindBMSSieglindeRatedCharts(playtype: Playtypes["bms"]): Promise<{
	charts: Array<MONGO_ChartDocument<"bms:7K" | "bms:14K">>;
	songs: Array<MONGO_SongDocument<"bms">>;
}> {
	const v3Game = GamePTToV3("bms", playtype) as Game;

	const sglEcPositive = sql<boolean>`(chart.data::jsonb->>'sglEC') IS NOT NULL AND (chart.data::jsonb->>'sglEC') <> '' AND (chart.data::jsonb->>'sglEC')::numeric > 0`;
	const sglHcPositive = sql<boolean>`(chart.data::jsonb->>'sglHC') IS NOT NULL AND (chart.data::jsonb->>'sglHC') <> '' AND (chart.data::jsonb->>'sglHC')::numeric > 0`;

	const rows = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select(SELECT_SONG_DOCUMENT)
		.where("chart.game", "=", v3Game)
		.where((eb) => eb.or([sglEcPositive, sglHcPositive]))
		.orderBy("chart.id")
		.execute();

	const charts: Array<MONGO_ChartDocument<"bms:7K" | "bms:14K">> = [];
	const songs: Array<MONGO_SongDocument<"bms">> = [];

	for (const row of rows) {
		charts.push(
			chartJoinedToDocument(
				row as { song_legacy_id: number } & ChartJoinedRow,
			) as MONGO_ChartDocument<"bms:7K" | "bms:14K">,
		);
		songs.push(ToSongDocument(row) as MONGO_SongDocument<"bms">);
	}

	return { charts, songs };
}

/** Like {@link FindBMSChartOnHash}, scoped to a single BMS v3 game (`bms-7k` / `bms-14k`). */
export async function FindBMSChartOnHashInGame(hash: string, v3Game: Game) {
	const row = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("chart.game", "=", v3Game)
		.where((eb) =>
			eb.or([
				sql<boolean>`(chart.data::jsonb->>'hashMD5') = ${hash}`,
				sql<boolean>`(chart.data::jsonb->>'hashSHA256') = ${hash}`,
			]),
		)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return chartJoinedToDocument(
		row as { song_legacy_id: number } & ChartJoinedRow,
	) as MONGO_ChartDocument<"bms:7K" | "bms:14K">;
}

/** All BMS charts matching MD5 or SHA256 in chart data. Used by global chart-hash search. */
export async function FindBMSChartsByHashMd5OrSha256(
	hash: string,
): Promise<Array<MONGO_ChartDocument>> {
	const rows = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("song.game_group", "=", "bms")
		.where((eb) =>
			eb.or([
				sql<boolean>`(chart.data::jsonb->>'hashMD5') = ${hash}`,
				sql<boolean>`(chart.data::jsonb->>'hashSHA256') = ${hash}`,
			]),
		)
		.execute();

	return rows.map((row) =>
		chartJoinedToDocument(row as { song_legacy_id: number } & ChartJoinedRow),
	);
}

/** All PMS charts matching MD5 or SHA256 in chart data. Used by global chart-hash search. */
export async function FindPMSChartsByHashMd5OrSha256(
	hash: string,
): Promise<Array<MONGO_ChartDocument>> {
	const rows = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("song.game_group", "=", "pms")
		.where((eb) =>
			eb.or([
				sql<boolean>`(chart.data::jsonb->>'hashMD5') = ${hash}`,
				sql<boolean>`(chart.data::jsonb->>'hashSHA256') = ${hash}`,
			]),
		)
		.execute();

	return rows.map((row) =>
		chartJoinedToDocument(row as { song_legacy_id: number } & ChartJoinedRow),
	);
}

/** All ITG Stamina charts matching hashGSv3. Used by global chart-hash search. */
export async function FindITGChartsByHashGSv3(hash: string): Promise<Array<MONGO_ChartDocument>> {
	const rows = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("chart.game", "=", "itg-stamina" as Game)
		.where(sql<boolean>`(chart.data::jsonb->>'hashGSv3') = ${hash}`)
		.execute();

	return rows.map((row) =>
		chartJoinedToDocument(row as { song_legacy_id: number } & ChartJoinedRow),
	);
}

/**
 * Beatoraja IR: chart by `data.hashSHA256` — BMS first, then PMS (SHA256 only; not MD5).
 */
export async function FindBeatorajaChartOnHashSHA256(
	hash: string,
): Promise<MONGO_ChartDocument<"bms:7K" | "bms:14K" | "pms:Controller" | "pms:Keyboard"> | null> {
	const bmsRow = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("song.game_group", "=", "bms")
		.where(sql<boolean>`(chart.data::jsonb->>'hashSHA256') = ${hash}`)
		.executeTakeFirst();

	if (bmsRow) {
		return chartJoinedToDocument(
			bmsRow as { song_legacy_id: number } & ChartJoinedRow,
		) as MONGO_ChartDocument<"bms:7K" | "bms:14K">;
	}

	const pmsRow = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("song.game_group", "=", "pms")
		.where(sql<boolean>`(chart.data::jsonb->>'hashSHA256') = ${hash}`)
		.executeTakeFirst();

	if (!pmsRow) {
		return null;
	}

	return chartJoinedToDocument(
		pmsRow as { song_legacy_id: number } & ChartJoinedRow,
	) as MONGO_ChartDocument<"pms:Controller" | "pms:Keyboard">;
}

/**
 * Find a Pop'n chart by SHA256 hash in chart data (batch-manual `popnChartHash`).
 */
export async function FindPopnChartOnHashSHA256(hash: string, playtype: Playtypes["popn"]) {
	const v3Game = GamePTToV3("popn", playtype) as Game;

	const row = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("song.game_group", "=", "popn")
		.where("chart.game", "=", v3Game)
		.where(sql<boolean>`(chart.data::jsonb->>'hashSHA256') = ${hash}`)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return chartJoinedToDocument(row as { song_legacy_id: number } & ChartJoinedRow);
}

/**
 * Returns true if at least one chart exists for this song (legacy Tachi song id).
 */
export async function SongHasAnyChart(game: GameGroup, songLegacyId: number): Promise<boolean> {
	const row = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select("chart.id")
		.where("song.game_group", "=", game)
		.where("song.legacy_id", "=", songLegacyId)
		.executeTakeFirst();

	return row !== undefined;
}

/**
 * Find a chart on its in-game-ID, playtype and difficulty.
 */
export async function FindChartOnInGameID(
	game: GameGroup,
	inGameID: number,
	playtype: Playtype,
	difficulty: Difficulties[GPTString],
) {
	if (game === "bms" || game === "usc") {
		throw new Error(`Cannot call FindChartOnInGameID for game ${game}.`);
	}

	const v3Game = GamePTToV3(game, playtype) as Game;

	const row = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("song.game_group", "=", game)
		.where("chart.game", "=", v3Game)
		.where(sql<boolean>`(chart.data::jsonb->>'inGameID')::int = ${inGameID}`)
		.where("chart.difficulty", "=", difficulty as string)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return chartJoinedToDocument(row as { song_legacy_id: number } & ChartJoinedRow);
}

/**
 * Like {@link FindChartOnInGameID}, but only matches charts with `isPrimary` set (batch-manual / legacy Mongo parity).
 */
export async function FindChartOnInGameIDPrimary(
	game: GameGroup,
	inGameID: number,
	playtype: Playtype,
	difficulty: Difficulties[GPTString],
) {
	if (game === "bms" || game === "usc") {
		throw new Error(`Cannot call FindChartOnInGameIDPrimary for game ${game}.`);
	}

	const v3Game = GamePTToV3(game, playtype) as Game;

	const row = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("song.game_group", "=", game)
		.where("chart.game", "=", v3Game)
		.where(sql<boolean>`(chart.data::jsonb->>'inGameID')::int = ${inGameID}`)
		.where("chart.difficulty", "=", difficulty as string)
		.where("chart.is_primary", "=", true)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return chartJoinedToDocument(row as { song_legacy_id: number } & ChartJoinedRow);
}

/**
 * Finds a non-custom chart on its in-game-ID, playtype and difficulty.
 * This explicitly ignores 2dxtra charts, and is necessary to use for iidx to disambiguate.
 */
export async function FindIIDXChartOnInGameID(
	inGameID: number,
	playtype: Playtypes["iidx"],
	difficulty: Difficulties["iidx:DP" | "iidx:SP"],
) {
	const v3Game = GamePTToV3("iidx", playtype) as Game;

	const row = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("chart.game", "=", v3Game)
		.where(sql<boolean>`(chart.data::jsonb->>'inGameID')::int = ${inGameID}`)
		.where(sql<SqlBool>`(chart.data->>'2dxtraSet') IS NULL`)
		.where("chart.is_primary", "=", true)
		.where("chart.difficulty", "=", difficulty as string)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return chartJoinedToDocument(row as { song_legacy_id: number } & ChartJoinedRow);
}

/**
 * Finds a non-custom chart on its in-game-ID, playtype and difficulty.
 * This explicitly ignores 2dxtra charts, and is necessary to use for iidx to disambiguate.
 */
export async function FindIIDXChartOnInGameIDVersion(
	inGameID: number,
	playtype: Playtypes["iidx"],
	difficulty: Difficulties["iidx:DP" | "iidx:SP"],
	version: Versions["iidx:DP" | "iidx:SP"],
) {
	const v3Game = GamePTToV3("iidx", playtype) as Game;

	const row = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("chart.game", "=", v3Game)
		.where(sql<boolean>`(chart.data::jsonb->>'inGameID')::int = ${inGameID}`)
		.where(sql<SqlBool>`(chart.data->>'2dxtraSet') IS NULL`)
		.where("chart.difficulty", "=", difficulty as string)
		.where(sql<boolean>`${sql.lit(String(version))} = ANY(chart.versions)`)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return chartJoinedToDocument(row as { song_legacy_id: number } & ChartJoinedRow);
}

/**
 * Find a chart on its in-game-ID, playtype, difficulty and version.
 */
export async function FindChartOnInGameIDVersion<GPT extends GPTString = GPTString>(
	game: GameGroup,
	inGameID: number,
	playtype: Playtype,
	difficulty: Difficulties[GPT],
	version: Versions[GPT],
) {
	const v3Game = GamePTToV3(game, playtype) as Game;

	const row = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("song.game_group", "=", game)
		.where("chart.game", "=", v3Game)
		.where(sql<boolean>`(chart.data::jsonb->>'inGameID')::int = ${inGameID}`)
		.where("chart.difficulty", "=", difficulty as string)
		.where(sql<boolean>`${sql.lit(String(version))} = ANY(chart.versions)`)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return chartJoinedToDocument(row as { song_legacy_id: number } & ChartJoinedRow);
}

/**
 * Find a chart on its in-game string ID, playtype and difficulty (primary chart only).
 */
export async function FindChartOnInGameStrIDPrimary(
	game: GameGroup,
	inGameStrID: string,
	playtype: Playtype,
	difficulty: Difficulties[GPTString],
) {
	if (game === "bms" || game === "usc") {
		throw new Error(`Cannot call FindChartOnInGameStrIDPrimary for game ${game}.`);
	}

	const v3Game = GamePTToV3(game, playtype) as Game;

	const row = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("song.game_group", "=", game)
		.where("chart.game", "=", v3Game)
		.where(sql<boolean>`(chart.data::jsonb->>'inGameStrID') = ${inGameStrID}`)
		.where("chart.difficulty", "=", difficulty as string)
		.where("chart.is_primary", "=", true)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return chartJoinedToDocument(row as { song_legacy_id: number } & ChartJoinedRow);
}

/**
 * Find a chart on its in-game string ID, playtype, difficulty and version.
 */
export async function FindChartOnInGameStrIDVersion<GPT extends GPTString = GPTString>(
	game: GameGroup,
	inGameStrID: string,
	playtype: Playtype,
	difficulty: Difficulties[GPT],
	version: Versions[GPT],
) {
	if (game === "bms" || game === "usc") {
		throw new Error(`Cannot call FindChartOnInGameStrIDVersion for game ${game}.`);
	}

	const v3Game = GamePTToV3(game, playtype) as Game;

	const row = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("song.game_group", "=", game)
		.where("chart.game", "=", v3Game)
		.where(sql<boolean>`(chart.data::jsonb->>'inGameStrID') = ${inGameStrID}`)
		.where("chart.difficulty", "=", difficulty as string)
		.where(sql<boolean>`${sql.lit(String(version))} = ANY(chart.versions)`)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return chartJoinedToDocument(row as { song_legacy_id: number } & ChartJoinedRow);
}

/**
 * Finds an IIDX chart on its 2dxtra hash, which is the sha256 of the .1 buffer.
 */
export async function FindIIDXChartWith2DXtraHash(hash: string) {
	const row = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("chart.game", "=", "iidx-sp" as Game)
		.where(sql<boolean>`(chart.data::jsonb->>'hashSHA256') = ${hash}`)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return chartJoinedToDocument(row as { song_legacy_id: number } & ChartJoinedRow);
}

const SDVX_INF_DIFFS = ["INF", "GRV", "HVN", "VVD", "XCD"] as const;

/**
 * Find an SDVX Chart on its in game ID. This exists to handle
 * oddities with SDVX difficulties - If "ANY_INF" is sent, it actually
 * refers to any of INF, GRV, HVN or VVD. This is because some services treat
 * all of those as the same difficulty, but we do not.
 */
export async function FindSDVXChartOnInGameID(
	inGameID: number,
	difficulty: "ANY_INF" | Difficulties["sdvx:Single"],
) {
	let q = DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("chart.game", "=", "sdvx" as Game)
		.where(sql<boolean>`(chart.data::jsonb->>'inGameID')::int = ${inGameID}`)
		.where("chart.is_primary", "=", true);

	q =
		difficulty === "ANY_INF"
			? q.where("chart.difficulty", "in", [...SDVX_INF_DIFFS])
			: q.where("chart.difficulty", "=", difficulty);

	const row = await q.executeTakeFirst();

	if (!row) {
		return null;
	}

	return chartJoinedToDocument(row as { song_legacy_id: number } & ChartJoinedRow);
}

export async function FindSDVXChartOnInGameIDVersion(
	inGameID: number,
	difficulty: "ANY_INF" | Difficulties["sdvx:Single"],
	version: Versions["sdvx:Single"],
) {
	let q = DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("chart.game", "=", "sdvx" as Game)
		.where(sql<boolean>`(chart.data::jsonb->>'inGameID')::int = ${inGameID}`)
		.where(sql<boolean>`${sql.lit(String(version))} = ANY(chart.versions)`);

	q =
		difficulty === "ANY_INF"
			? q.where("chart.difficulty", "in", [...SDVX_INF_DIFFS])
			: q.where("chart.difficulty", "=", difficulty);

	const row = await q.executeTakeFirst();

	if (!row) {
		return null;
	}

	return chartJoinedToDocument(row as { song_legacy_id: number } & ChartJoinedRow);
}

export async function FindSDVXChartOnDFVersion(
	songID: integer,
	difficulty: "ANY_INF" | Difficulties["sdvx:Single"],
	version: Versions["sdvx:Single"],
) {
	let q = DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("song.game_group", "=", "sdvx")
		.where("song.legacy_id", "=", songID)
		.where("chart.game", "=", "sdvx" as Game)
		.where(sql<boolean>`${sql.lit(String(version))} = ANY(chart.versions)`);

	q =
		difficulty === "ANY_INF"
			? q.where("chart.difficulty", "in", [...SDVX_INF_DIFFS])
			: q.where("chart.difficulty", "=", difficulty);

	const row = await q.executeTakeFirst();

	if (!row) {
		return null;
	}

	return chartJoinedToDocument(row as { song_legacy_id: number } & ChartJoinedRow);
}

export async function FindChartOnSHA256(game: GameGroup, hash: string) {
	if (game !== "bms" && game !== "usc" && game !== "iidx" && game !== "pms") {
		throw new Error(`Cannot call FindChartOnSHA256 for game ${game}.`);
	}

	const row = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("song.game_group", "=", game)
		.where(sql<boolean>`(chart.data::jsonb->>'hashSHA256') = ${hash}`)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return chartJoinedToDocument(row as { song_legacy_id: number } & ChartJoinedRow);
}

export async function FindChartOnSHA256Playtype(game: GameGroup, hash: string, playtype: Playtype) {
	if (game !== "bms" && game !== "usc" && game !== "iidx" && game !== "pms") {
		throw new Error(`Cannot call FindChartOnSHA256 for game ${game}.`);
	}

	const v3Game = GamePTToV3(game, playtype) as Game;

	const row = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("song.game_group", "=", game)
		.where("chart.game", "=", v3Game)
		.where(sql<boolean>`(chart.data::jsonb->>'hashSHA256') = ${hash}`)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return chartJoinedToDocument(row as { song_legacy_id: number } & ChartJoinedRow);
}

/**
 * Find a USC chart on its SHA1 hash (from chart data) and playtype.
 * Used by the USC IR and batch-manual uscChartHash matching.
 */
export async function FindUSCChartOnSHA1Playtype(hash: string, playtype: Playtypes["usc"]) {
	const v3Game = GamePTToV3("usc", playtype) as Game;

	const row = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("song.game_group", "=", "usc")
		.where("chart.game", "=", v3Game)
		.where(sql<boolean>`(chart.data::jsonb->>'hashSHA1') = ${hash}`)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return chartJoinedToDocument(row as { song_legacy_id: number } & ChartJoinedRow);
}

/** All USC charts matching a SHA1 hash (any playtype). Used by global chart-hash search. */
export async function FindUSCChartsByHashSHA1(hash: string): Promise<Array<MONGO_ChartDocument>> {
	const rows = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("song.game_group", "=", "usc")
		.where(sql<boolean>`(chart.data::jsonb->>'hashSHA1') = ${hash}`)
		.execute();

	return rows.map((row) =>
		chartJoinedToDocument(row as { song_legacy_id: number } & ChartJoinedRow),
	);
}

/**
 * Returns the N most popular charts for this game + playtype.
 * Popularity is determined by how many rows exist in Postgres `score` for each chart.
 *
 * @param _scoreCollection — ignored; kept for API compatibility with the old Mongo implementation.
 */
export async function FindChartsOnPopularity(
	game: GameGroup,
	playtype: Playtype,
	songIDs?: Array<integer>,
	skip = 0,
	limit = 100,
	_scoreCollection: "personal-bests" | "scores" = "personal-bests",
): Promise<Array<{ __playcount: integer } & MONGO_ChartDocument>> {
	const v3Game = GamePTToV3(game, playtype);

	let q = DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.leftJoin("score", "score.chart_id", "chart.id")
		.where("chart.game", "=", v3Game as Game)
		.where(sql<SqlBool>`(chart.data->>'2dxtraSet') IS NULL`);

	if (songIDs && songIDs.length > 0) {
		q = q.where("song.legacy_id", "in", songIDs);
	}

	const rows = await q
		.select([
			"chart.id",
			"chart.legacy_id",
			"chart.game",
			"chart.song_id",
			"chart.level",
			"chart.level_num",
			"chart.is_primary",
			"chart.difficulty",
			"chart.versions",
			"chart.data",
			"song.legacy_id as song_legacy_id",
			sql<number>`count(score.id)::int`.as("playcount"),
		])
		.groupBy(["chart.id", "song.legacy_id"])
		.orderBy(sql`count(score.id)`, "desc")
		.offset(skip)
		.limit(limit)
		.execute();

	if (rows.length === 0) {
		return [];
	}

	return rows.map((row) => {
		const { playtype: chartPlaytype } = V3ToGamePT(row.game);

		return {
			chartID: row.id,
			legacyChartId: row.legacy_id,
			songID: row.song_legacy_id,
			level: row.level,
			levelNum: row.level_num,
			isPrimary: row.is_primary,
			difficulty: row.difficulty as Difficulties[GPTString],
			playtype: chartPlaytype,
			data: row.data as MONGO_ChartDocumentData[GPTString],
			versions: row.versions as Versions[GPTString][],
			__playcount: row.playcount,
		} as { __playcount: integer } & MONGO_ChartDocument;
	});
}
