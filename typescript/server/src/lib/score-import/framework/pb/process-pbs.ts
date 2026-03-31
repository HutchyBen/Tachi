import type { KtLogger } from "#lib/log/log";
import type { Game } from "tachi-db";

import DB from "#services/pg/db";
import { GetChartForIDGuaranteed } from "#utils/db";
import {
	type GameGroup,
	GamePTToV3,
	GetGPTString,
	type integer,
	type Playtype,
} from "tachi-common";

import { CreatePBDoc, type MONGO_PBScoreDocumentNoRank, UpdateChartRanking } from "./create-pb-doc";
import { upsertPbFromMongoDoc } from "./upsert-pb-pg";

/**
 * Process, recalculate and update a users PBs for this set of chartIDs.
 */
export async function ProcessPBs(
	game: GameGroup,
	playtype: Playtype,
	userID: integer,
	chartIDs: Set<string>,
	log: KtLogger,
): Promise<void> {
	if (chartIDs.size === 0) {
		return;
	}

	const gpt = GetGPTString(game, playtype);

	const promises = [];

	for (const chartID of chartIDs) {
		promises.push(
			GetChartForIDGuaranteed(game, chartID).then((chart) =>
				CreatePBDoc(gpt, userID, chart, log),
			),
		);
	}

	const pbDocsReturn = await Promise.all(promises);

	const pbDocs: Array<MONGO_PBScoreDocumentNoRank> = [];

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

	await Promise.all(pbDocs.map((e) => UpdateChartRanking(game, playtype, e.chartID)));
}

/**
 * Re-runs {@link ProcessPBs} for every user who still has scores on any of the given charts
 * (Postgres `score` / `chart` tables). Used after bulk PB removal so rankings stay coherent.
 */
export async function RecalculatePbsForChartsFromPostgresScores(
	game: GameGroup,
	playtype: Playtype,
	chartLegacyIds: ReadonlyArray<string>,
	log: KtLogger,
): Promise<void> {
	if (chartLegacyIds.length === 0) {
		return;
	}

	const v3Game = GamePTToV3(game, playtype) as Game;

	const rows = await DB.selectFrom("score")
		.innerJoin("chart", "chart.id", "score.chart_id")
		.select(["score.user_id", "chart.legacy_id"])
		.where("chart.legacy_id", "in", [...chartLegacyIds])
		.where("chart.game", "=", v3Game)
		.execute();

	const byUser = new Map<integer, Set<string>>();

	for (const r of rows) {
		let set = byUser.get(r.user_id);

		if (!set) {
			set = new Set();
			byUser.set(r.user_id, set);
		}

		set.add(r.legacy_id);
	}

	for (const [uid, cids] of byUser) {
		await ProcessPBs(game, playtype, uid, cids, log);
	}
}
