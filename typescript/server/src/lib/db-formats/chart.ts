import type { Game } from "tachi-db";

import DB from "#services/pg/db";
import { sql, type SqlBool } from "kysely";
import {
	type ChartDocument,
	type ChartDocumentData,
	type Difficulties,
	type GPTString,
	V3ToGamePT,
	type Versions,
} from "tachi-common";

/**
 * Fetches all charts for a given PG game string (e.g. "iidx-sp") and song PG UUID,
 * including their version tags from `chart_version`. Returns fully-formed
 * ChartDocuments using the provided legacy song ID for the `songID` field.
 */
export async function GetChartsBySongPgId(
	gamePt: Game,
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
		.where("game", "=", gamePt);

	if (opts?.omit2dxtraCharts && String(gamePt).startsWith("iidx-")) {
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

	return rows.map((row) => {
		const { playtype } = V3ToGamePT(row.game);

		return {
			chartID: row.legacy_id,
			songID: songLegacyId,
			level: row.level,
			levelNum: row.level_num,
			isPrimary: row.is_primary,
			difficulty: row.difficulty as Difficulties[GPTString],
			playtype,
			data: row.data as ChartDocumentData[GPTString],
			versions: (versionsByChartId.get(row.id) ?? []) as Versions[GPTString][],
		} as ChartDocument;
	});
}
