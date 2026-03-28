import type { Game } from "tachi-db";

import MONGODB_KILL from "#services/mongo/db";
import DB from "#services/pg/db";
import { sql, type SqlBool } from "kysely";
import {
	type ChartDocument,
	type ChartDocumentData,
	type Difficulties,
	type GameGroup,
	GamePTToV3,
	type GPTString,
	type integer,
	type Playtype,
	type Playtypes,
	V3ToGamePT,
	type Versions,
} from "tachi-common";

export function FindChartWithChartID(game: GameGroup, chartID: string) {
	return MONGODB_KILL.anyCharts[game].findOne({ chartID });
}

/**
 * Find chart with PlaytypeDifficulty. This only finds charts that have `isPrimary` set to true.
 * If you want to find charts that are not primary, you need to use PTDFVersion.
 * @see FindChartWithPTDFVersion
 */
export function FindChartWithPTDF<
	G extends GameGroup = GameGroup,
	P extends Playtypes[G] = Playtypes[G],
	GPT extends GPTString = GPTString,
>(game: G, songID: integer, playtype: P, difficulty: Difficulties[GPT]) {
	return MONGODB_KILL.anyCharts[game].findOne({
		songID,
		playtype,
		difficulty,
		isPrimary: true,
	});
}

/**
 * Find chart with Playtype, Difficulty and a given version. This does not necessarily return a chart that has
 * `isPrimary` set.
 */
export function FindChartWithPTDFVersion<
	G extends GameGroup = GameGroup,
	P extends Playtypes[G] = Playtypes[G],
	GPT extends GPTString = GPTString,
>(game: G, songID: integer, playtype: P, difficulty: Difficulties[GPT], version: Versions[GPT]) {
	return MONGODB_KILL.anyCharts[game].findOne({
		songID,
		playtype,
		difficulty,
		versions: version,
	});
}

export function FindITGChartOnHash(hash: string) {
	return MONGODB_KILL.charts.itg.findOne({
		"data.hashGSv3": hash,
	});
}

/**
 * Find a BMS chart on either its md5sum or its sha256sum.
 * @param hash The md5 or sha256 hash to look for.
 */
export function FindBMSChartOnHash(hash: string) {
	return MONGODB_KILL.charts.bms.findOne({
		$or: [{ "data.hashMD5": hash }, { "data.hashSHA256": hash }],
	}) as Promise<ChartDocument<"bms:7K" | "bms:14K"> | null>;
}

/**
 * Find a chart on its in-game-ID, playtype and difficulty.
 */
export function FindChartOnInGameID(
	game: GameGroup,
	inGameID: number,
	playtype: Playtype,
	difficulty: Difficulties[GPTString],
) {
	if (game === "bms" || game === "usc") {
		throw new Error(`Cannot call FindChartOnInGameID for game ${game}.`);
	}

	return MONGODB_KILL.anyCharts[game].findOne({
		"data.inGameID": inGameID,
		playtype,
		difficulty,
	});
}

/**
 * Finds a non-custom chart on its in-game-ID, playtype and difficulty.
 * This explicitly ignores 2dxtra charts, and is necessary to use for iidx to disambiguate.
 */
export function FindIIDXChartOnInGameID(
	inGameID: number,
	playtype: Playtypes["iidx"],
	difficulty: Difficulties["iidx:DP" | "iidx:SP"],
) {
	return MONGODB_KILL.charts.iidx.findOne({
		"data.inGameID": inGameID,
		"data.2dxtraSet": null,
		isPrimary: true,
		playtype,
		difficulty,
	});
}

/**
 * Finds a non-custom chart on its in-game-ID, playtype and difficulty.
 * This explicitly ignores 2dxtra charts, and is necessary to use for iidx to disambiguate.
 */
export function FindIIDXChartOnInGameIDVersion(
	inGameID: number,
	playtype: Playtypes["iidx"],
	difficulty: Difficulties["iidx:DP" | "iidx:SP"],
	version: Versions["iidx:DP" | "iidx:SP"],
) {
	return MONGODB_KILL.charts.iidx.findOne({
		"data.inGameID": inGameID,
		"data.2dxtraSet": null,
		playtype,
		difficulty,
		versions: version,
	});
}

/**
 * Find a chart on its in-game-ID, playtype, difficulty and version.
 */
export function FindChartOnInGameIDVersion<GPT extends GPTString = GPTString>(
	game: GameGroup,
	inGameID: number,
	playtype: Playtype,
	difficulty: Difficulties[GPT],
	version: Versions[GPT],
) {
	return MONGODB_KILL.anyCharts[game].findOne({
		"data.inGameID": inGameID,
		versions: version,
		playtype,
		difficulty,
	});
}

/**
 * Finds an IIDX chart on its 2dxtra hash, which is the sha256 of the .1 buffer.
 */
export function FindIIDXChartWith2DXtraHash(hash: string) {
	return MONGODB_KILL.charts.iidx.findOne({
		"data.hashSHA256": hash,
	});
}

/**
 * Find an SDVX Chart on its in game ID. This exists to handle
 * oddities with SDVX difficulties - If "ANY_INF" is sent, it actually
 * refers to any of INF, GRV, HVN or VVD. This is because some services treat
 * all of those as the same difficulty, but we do not.
 */
export function FindSDVXChartOnInGameID(
	inGameID: number,
	difficulty: "ANY_INF" | Difficulties["sdvx:Single"],
) {
	const diffQuery =
		difficulty === "ANY_INF"
			? { $in: ["INF", "GRV", "HVN", "VVD", "XCD"] as Array<Difficulties["sdvx:Single"]> }
			: difficulty;

	return MONGODB_KILL.charts.sdvx.findOne({
		"data.inGameID": inGameID,
		difficulty: diffQuery,
		isPrimary: true,
	});
}

export function FindSDVXChartOnInGameIDVersion(
	inGameID: number,
	difficulty: "ANY_INF" | Difficulties["sdvx:Single"],
	version: Versions["sdvx:Single"],
) {
	const diffQuery =
		difficulty === "ANY_INF"
			? { $in: ["INF", "GRV", "HVN", "VVD", "XCD"] as Array<Difficulties["sdvx:Single"]> }
			: difficulty;

	return MONGODB_KILL.charts.sdvx.findOne({
		"data.inGameID": inGameID,
		difficulty: diffQuery,
		versions: version,
	});
}

export function FindSDVXChartOnDFVersion(
	songID: integer,
	difficulty: "ANY_INF" | Difficulties["sdvx:Single"],
	version: Versions["sdvx:Single"],
) {
	const diffQuery =
		difficulty === "ANY_INF"
			? { $in: ["INF", "GRV", "HVN", "VVD", "XCD"] as Array<Difficulties["sdvx:Single"]> }
			: difficulty;

	return MONGODB_KILL.charts.sdvx.findOne({
		songID,
		difficulty: diffQuery,
		versions: version,
	});
}

export function FindChartOnSHA256(game: GameGroup, hash: string) {
	if (game !== "bms" && game !== "usc" && game !== "iidx" && game !== "pms") {
		throw new Error(`Cannot call FindChartOnSHA256 for game ${game}.`);
	}

	return MONGODB_KILL.anyCharts[game].findOne({
		"data.hashSHA256": hash,
	});
}

export function FindChartOnSHA256Playtype(game: GameGroup, hash: string, playtype: Playtype) {
	if (game !== "bms" && game !== "usc" && game !== "iidx" && game !== "pms") {
		throw new Error(`Cannot call FindChartOnSHA256 for game ${game}.`);
	}

	return MONGODB_KILL.anyCharts[game].findOne({
		"data.hashSHA256": hash,
		playtype,
	});
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
): Promise<Array<{ __playcount: integer } & ChartDocument>> {
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

	const chartPgIds = rows.map((r) => r.id);

	const versionRows = await DB.selectFrom("chart_version")
		.select(["chart_id", "version"])
		.where("chart_id", "in", chartPgIds)
		.execute();

	const versionsByChartId = new Map<string, string[]>();

	for (const v of versionRows) {
		let list = versionsByChartId.get(v.chart_id);

		if (!list) {
			list = [];
			versionsByChartId.set(v.chart_id, list);
		}

		list.push(v.version);
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
			data: row.data as ChartDocumentData[GPTString],
			versions: (versionsByChartId.get(row.id) ?? []) as Versions[GPTString][],
			__playcount: row.playcount,
		} as { __playcount: integer } & ChartDocument;
	});
}
