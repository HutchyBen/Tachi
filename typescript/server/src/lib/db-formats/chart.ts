import DB from "#services/pg/db";
import type { ChartDocument, ChartDocumentData, Difficulties, GPTString, Versions } from "tachi-common";
import { V3ToGamePT } from "tachi-common";
import type { Game } from "tachi-db";

/**
 * Fetches all charts for a given PG game string (e.g. "iidx-sp") and song PG UUID,
 * including their version tags from `chart_version`. Returns fully-formed
 * ChartDocuments using the provided legacy song ID for the `songID` field.
 */
export async function GetChartsBySongPgId(
	gamePt: Game,
	songPgId: string,
	songLegacyId: number,
): Promise<ChartDocument[]> {
	const rows = await DB.selectFrom("chart")
		.select(["id", "legacy_id", "game", "level", "level_num", "is_primary", "difficulty", "data"])
		.where("song_id", "=", songPgId)
		.where("game", "=", gamePt)
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
