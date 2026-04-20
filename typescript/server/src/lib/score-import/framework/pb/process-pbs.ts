import type { KtLogger } from "#lib/log/log";

import DB from "#services/pg/db";
import { GetChartForIDGuaranteed } from "#utils/db";
import { type integer, type V3Game } from "tachi-common";

import { CreatePBDoc, type PBScoreDocumentNoRank, UpdateChartRanking } from "./create-pb-doc";
import { upsertPbFromMongoDoc } from "./upsert-pb-pg";

/**
 * Process, recalculate and update a users PBs for this set of chartIDs.
 */
export async function ProcessPBs(
	game: V3Game,
	userID: integer,
	chartIDs: Set<string>,
	log: KtLogger,
): Promise<void> {
	if (chartIDs.size === 0) {
		return;
	}

	const promises = [];

	for (const chartID of chartIDs) {
		promises.push(
			GetChartForIDGuaranteed(chartID).then((chart) => CreatePBDoc(game, userID, chart, log)),
		);
	}

	const pbDocsReturn = await Promise.all(promises);

	const pbDocs: Array<PBScoreDocumentNoRank> = [];

	for (const doc of pbDocsReturn) {
		if (!doc) {
			continue;
		}

		pbDocs.push(doc);
	}

	if (pbDocs.length === 0) {
		return;
	}

	await DB.transaction().execute(async (trx) => {
		// TODO(zk): parallelize?
		for (const doc of pbDocs) {
			await upsertPbFromMongoDoc(trx, doc);
		}
	});

	await Promise.all(pbDocs.map((doc) => UpdateChartRanking(doc.game, doc.chartID)));
}

/**
 * Re-runs {@link ProcessPBs} for every user who still has scores on any of the given charts
 * (Postgres `score` / `chart` tables). Used after bulk PB removal so rankings stay coherent.
 */
export async function RecalculatePbsForChartsFromPostgresScores(
	game: V3Game,
	chartIDs: ReadonlyArray<string>,
	log: KtLogger,
): Promise<void> {
	if (chartIDs.length === 0) {
		return;
	}

	const rows = await DB.selectFrom("score")
		.innerJoin("chart", "chart.id", "score.chart_id")
		.select(["score.user_id", "chart.id"])
		.where("chart.id", "in", [...chartIDs])
		.where("chart.game", "=", game)
		.execute();

	const byUser = new Map<integer, Set<string>>();

	for (const r of rows) {
		let set = byUser.get(r.user_id);

		if (!set) {
			set = new Set();
			byUser.set(r.user_id, set);
		}

		set.add(r.id);
	}

	for (const [uid, cids] of byUser) {
		await ProcessPBs(game, uid, cids, log);
	}
}
