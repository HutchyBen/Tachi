import type { KtLogger } from "#lib/log/log.js";

import db from "#services/mongo/db";
import { GetChartForIDGuaranteed } from "#utils/db";
import { type GameGroup, GetGPTString, type integer, type Playtype } from "tachi-common";

import { CreatePBDoc, type PBScoreDocumentNoRank, UpdateChartRanking } from "./create-pb-doc";

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

	const pbDocs: Array<PBScoreDocumentNoRank> = [];

	for (const doc of pbDocsReturn) {
		if (!doc) {
			continue;
		}

		pbDocs.push(doc);
	}

	if (pbDocsReturn.length === 0) {
		return;
	}

	// so here's the kinda awkward part - for the time between this operation
	// and the next one - THE SCORE PBS ARE IN THE DATABASE WITHOUT RANKINGDATA.
	// this *is* bad behaviour, but I don't have a nice way to fix it.
	// This should be fixed in the future to avoid crashes between these two
	// calls - but that is unlikely.
	await db["personal-bests"].bulkWrite(
		pbDocs.map((e) => ({
			updateOne: {
				filter: { chartID: e.chartID, userID: e.userID },
				update: {
					$set: {
						...e,

						// stub out ranking data with some invalid nonsense.
						rankingData: {
							outOf: 0,
							rank: 0,
							rivalRank: null,
						},
					},
				},
				upsert: true,
			},
		})),
		{
			ordered: false,
		},
	);

	// now that everything has been updated or inserted, we can refresh
	// the chart rankings.
	await Promise.all(pbDocs.map((e) => UpdateChartRanking(game, playtype, e.chartID)));

	// and we're done!
}
