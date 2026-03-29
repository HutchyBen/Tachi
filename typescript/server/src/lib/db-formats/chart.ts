import type { Database, Game } from "tachi-db";

import DB from "#services/pg/db";
import { type Selection, sql, type SqlBool } from "kysely";
import {
	type Difficulties,
	type GameGroup,
	type GPTString,
	type MONGO_ChartDocument,
	type MONGO_ChartDocumentData,
	V3ToGameGroup,
	V3ToGamePT,
	type Versions,
} from "tachi-common";

export const SELECT_CHART = [
	"chart.id",
	"chart.legacy_id",
	"chart.game",
	"chart.level",
	"chart.level_num",
	"chart.is_primary",
	"chart.difficulty",
	"chart.versions",
	"chart.data",
	"chart.song_id",
] as const;

type ChartRow = Selection<Database, "chart", (typeof SELECT_CHART)[number]>;

export function ToChartDocument(row: ChartRow, songLegacyId: number): MONGO_ChartDocument {
	const { playtype } = V3ToGamePT(row.game);

	return {
		chartID: row.id,
		legacyChartId: row.legacy_id,
		songID: songLegacyId,
		level: row.level,
		levelNum: row.level_num,
		isPrimary: row.is_primary,
		difficulty: row.difficulty as Difficulties[GPTString],
		playtype,
		data: row.data as MONGO_ChartDocumentData[GPTString],
		versions: row.versions as Versions[GPTString][],
	};
}

/**
 * Fetches all charts for a given PG game string (e.g. "iidx-sp") and song PG UUID,
 * including `chart.versions`. Returns fully-formed ChartDocuments using the provided
 * legacy song ID for the `songID` field.
 */
export async function GetChartsBySongPgId(
	v3Game: Game,
	songPgId: string,
	songLegacyId: number,
	opts?: { omit2dxtraCharts?: boolean },
): Promise<MONGO_ChartDocument[]> {
	let q = DB.selectFrom("chart")
		.select(SELECT_CHART)
		.where("song_id", "=", songPgId)
		.where("game", "=", v3Game);

	const gameGroup = V3ToGameGroup(v3Game);

	if (opts?.omit2dxtraCharts && gameGroup === "iidx") {
		q = q.where(sql<SqlBool>`(data->>'2dxtraSet') IS NULL`);
	}

	const rows = await q.execute();

	return rows.map((row) => ToChartDocument(row, songLegacyId));
}

/**
 * Loads a single chart by Postgres `chart.id` or `legacy_id`, scoped to `v3Game`.
 */
export async function GetChartByPgIdOrLegacyId(
	v3Game: Game,
	chartIdParam: string,
): Promise<MONGO_ChartDocument | undefined> {
	const chartRow = await DB.selectFrom("chart")
		.select(SELECT_CHART)
		.where("game", "=", v3Game)
		.where((eb) => eb.or([eb("id", "=", chartIdParam), eb("legacy_id", "=", chartIdParam)]))
		.executeTakeFirst();

	if (!chartRow) {
		return undefined;
	}

	const songRow = await DB.selectFrom("song")
		.select("legacy_id")
		.where("id", "=", chartRow.song_id)
		.executeTakeFirst();

	if (!songRow) {
		return undefined;
	}

	return ToChartDocument(chartRow, songRow.legacy_id);
}

/** Loads charts for a game by canonical `chart.id` and/or legacy `chart.legacy_id` keys (score/PB `chartID`). */
export async function GetChartsByLegacyIds(
	game: GameGroup,
	chartKeys: Array<string>,
): Promise<Array<MONGO_ChartDocument>> {
	if (chartKeys.length === 0) {
		return [];
	}

	const unique = [...new Set(chartKeys)];

	const rows = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("song.game_group", "=", game)
		.where((eb) => eb.or([eb("chart.id", "in", unique), eb("chart.legacy_id", "in", unique)]))
		.execute();

	return rows.map((r) => ToChartDocument(r, r.song_legacy_id));
}
