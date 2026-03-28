import type { Game } from "tachi-db";

import DB from "#services/pg/db";
import { sql, type SqlBool } from "kysely";
import {
	type ChartDocument,
	type ChartDocumentData,
	type Difficulties,
	type GPTString,
	V3ToGameGroup,
	V3ToGamePT,
	type Versions,
} from "tachi-common";

type ChartRow = {
	id: string;
	legacy_id: string;
	game: Game;
	level: string;
	level_num: number;
	is_primary: boolean;
	difficulty: string;
	data: unknown;
};

function mapRowToChartDocument(
	row: ChartRow,
	songLegacyId: number,
	versions: string[],
): ChartDocument {
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
		data: row.data as ChartDocumentData[GPTString],
		versions: versions as Versions[GPTString][],
	} as ChartDocument;
}

/**
 * Fetches all charts for a given PG game string (e.g. "iidx-sp") and song PG UUID,
 * including their version tags from `chart_version`. Returns fully-formed
 * ChartDocuments using the provided legacy song ID for the `songID` field.
 */
export async function GetChartsBySongPgId(
	v3Game: Game,
	songPgId: string,
	songLegacyId: number,
	opts?: { omit2dxtraCharts?: boolean },
): Promise<ChartDocument[]> {
	let q = DB.selectFrom("chart")
		.select([
			"id",
			"legacy_id",
			"game",
			"level",
			"level_num",
			"is_primary",
			"difficulty",
			"data",
		])
		.where("song_id", "=", songPgId)
		.where("game", "=", v3Game);

	const gameGroup = V3ToGameGroup(v3Game);

	if (opts?.omit2dxtraCharts && gameGroup === "iidx") {
		q = q.where(sql<SqlBool>`(data->>'2dxtraSet') IS NULL`);
	}

	const rows = await q.execute();

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

	return rows.map((row) =>
		mapRowToChartDocument(
			row,
			songLegacyId,
			versionsByChartId.get(row.id) ?? [],
		),
	);
}

/**
 * Loads a single chart by Postgres `chart.id` or `legacy_id`, scoped to `v3Game`.
 */
export async function GetChartByPgIdOrLegacyId(
	v3Game: Game,
	chartIdParam: string,
): Promise<ChartDocument | undefined> {
	const chartRow = await DB.selectFrom("chart")
		.select([
			"id",
			"legacy_id",
			"game",
			"song_id",
			"level",
			"level_num",
			"is_primary",
			"difficulty",
			"data",
		])
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

	const versionRows = await DB.selectFrom("chart_version")
		.select("version")
		.where("chart_id", "=", chartRow.id)
		.execute();

	const versions = versionRows.map((v) => v.version);

	return mapRowToChartDocument(
		{
			id: chartRow.id,
			legacy_id: chartRow.legacy_id,
			game: chartRow.game,
			level: chartRow.level,
			level_num: chartRow.level_num,
			is_primary: chartRow.is_primary,
			difficulty: chartRow.difficulty,
			data: chartRow.data,
		},
		songRow.legacy_id,
		versions,
	);
}
