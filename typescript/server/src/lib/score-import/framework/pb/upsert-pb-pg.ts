import type { Kysely } from "kysely";
import type { Database } from "tachi-db";

import { GPT_SERVER_IMPLEMENTATIONS } from "#game-implementations/game-implementations";
import { mongoScoreDataToPg } from "#lib/v3/migration-tools";
import { UnixMillisecondsToISO8601 } from "#utils/time";
import { GetGPTString, type GPTString, type MONGO_PBScoreDocument } from "tachi-common";

export type MONGO_PBScoreDocumentNoRank<GPT extends GPTString = GPTString> = Omit<
	MONGO_PBScoreDocument<GPT>,
	"rankingData"
>;

/**
 * Inserts or updates a `pb` row plus `pb_composed_from` for one user/chart (lens = null).
 */
export async function upsertPbFromMongoDoc(
	db: Kysely<Database>,
	pbDoc: MONGO_PBScoreDocumentNoRank,
): Promise<void> {
	const gpt = GetGPTString(pbDoc.game, pbDoc.playtype);
	const { data, derived, judgements } = mongoScoreDataToPg(gpt, pbDoc.scoreData);
	const judgementsJson = JSON.stringify(judgements);
	const ranking = GPT_SERVER_IMPLEMENTATIONS[gpt].pbRankingValues(pbDoc as never);

	const calc = { ...(pbDoc.calculatedData as Record<string, unknown>) };
	delete calc.rank;
	delete calc.outOf;
	const calculated = {
		...calc,
		rivalRank: null,
	};

	const existing = await db
		.selectFrom("pb")
		.select("row_id")
		.where("user_id", "=", pbDoc.userID)
		.where("chart_id", "=", pbDoc.chartID)
		.where("lens", "is", null)
		.executeTakeFirst();

	let pbId: string;

	if (existing) {
		pbId = existing.row_id;

		await db
			.updateTable("pb")
			.set({
				data: JSON.stringify(data),
				derived_data: JSON.stringify(derived),
				judgements: judgementsJson,
				calculated_data: JSON.stringify(calculated),
				ranking_value: ranking.ranking,
				ranking_value_tb1: ranking.tb1,
				ranking_value_tb2: ranking.tb2,
				ranking_value_tb3: ranking.tb3,
				ranking_value_tb4: ranking.tb4,
				ranking_value_tb5: ranking.tb5,
				highlight: pbDoc.highlight,
				time_achieved:
					pbDoc.timeAchieved !== null && pbDoc.timeAchieved !== undefined
						? UnixMillisecondsToISO8601(pbDoc.timeAchieved)
						: null,
			})
			.where("row_id", "=", pbId)
			.execute();
	} else {
		const inserted = await db
			.insertInto("pb")
			.values({
				user_id: pbDoc.userID,
				chart_id: pbDoc.chartID,
				lens: null,
				data: JSON.stringify(data),
				derived_data: JSON.stringify(derived),
				judgements: judgementsJson,
				calculated_data: JSON.stringify(calculated),
				ranking_value: ranking.ranking,
				ranking_value_tb1: ranking.tb1,
				ranking_value_tb2: ranking.tb2,
				ranking_value_tb3: ranking.tb3,
				ranking_value_tb4: ranking.tb4,
				ranking_value_tb5: ranking.tb5,
				highlight: pbDoc.highlight,
				time_achieved:
					pbDoc.timeAchieved !== null && pbDoc.timeAchieved !== undefined
						? UnixMillisecondsToISO8601(pbDoc.timeAchieved)
						: null,
			})
			.returning("row_id")
			.executeTakeFirstOrThrow();

		pbId = inserted.row_id;
	}

	await db.deleteFrom("pb_composed_from").where("pb_id", "=", pbId).execute();

	for (const ref of pbDoc.composedFrom) {
		await db
			.insertInto("pb_composed_from")
			.values({
				pb_id: pbId,
				score_id: ref.scoreID,
			})
			.execute();
	}
}
