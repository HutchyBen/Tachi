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
	"chart.id as chart_id",
	"chart.game as chart_game",
	"chart.level as chart_level",
	"chart.level_num as chart_level_num",
	"chart.is_primary as chart_is_primary",
	"chart.difficulty as chart_difficulty",
	"chart.versions as chart_versions",
	"chart.data as chart_data",
	"chart.song_id as chart_song_id",
] as const;

type ChartRow = Selection<Database, "chart", (typeof SELECT_CHART)[number]>;

export function ToChartDocument(row: ChartRow, songLegacyId: number): MONGO_ChartDocument {
	const { playtype } = V3ToGamePT(row.chart_game);

	return {
		chartID: row.chart_id,
		songID: songLegacyId,
		level: row.chart_level,
		levelNum: row.chart_level_num,
		isPrimary: row.chart_is_primary,
		difficulty: row.chart_difficulty as Difficulties[GPTString],
		playtype,
		data: row.chart_data as MONGO_ChartDocumentData[GPTString],
		versions: row.chart_versions as Versions[GPTString][],
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
export async function GetChartById(
	v3Game: Game,
	chartID: string,
): Promise<MONGO_ChartDocument | undefined> {
	const chartRow = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.select("song.legacy_id as song_legacy_id")
		.where("chart.game", "=", v3Game)
		.where("chart.id", "=", chartID)
		.executeTakeFirst();

	if (!chartRow) {
		return undefined;
	}

	return ToChartDocument(chartRow, chartRow.song_legacy_id);
}

// Loads charts from a list of IDs.
// This function should rarely be used - it's an antipattern in sql to do queries like this.
export async function GetChartsByIds(
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
		.where("chart.id", "in", unique)
		.execute();

	return rows.map((r) => ToChartDocument(r, r.song_legacy_id));
}
