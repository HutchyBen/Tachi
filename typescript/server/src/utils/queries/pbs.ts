import type { MONGO_PBScoreDocument } from "tachi-common";

import MONGODB_KILL from "#services/mongo/db";

export async function GetAdjacentAbove(userPB: MONGO_PBScoreDocument, size = 5) {
	const adjAbove = (await MONGODB_KILL["personal-bests"].find(
		{
			chartID: userPB.chartID,
			"rankingData.rank": { $lt: userPB.rankingData.rank },
		},
		{
			limit: size,
			sort: { "rankingData.rank": -1 },
		},
	)) as Array<MONGO_PBScoreDocument<"usc:Controller" | "usc:Keyboard">>;

	return adjAbove;
}

export async function GetAdjacentBelow(userPB: MONGO_PBScoreDocument, size = 5) {
	const adjAbove = (await MONGODB_KILL["personal-bests"].find(
		{
			chartID: userPB.chartID,
			"rankingData.rank": { $gt: userPB.rankingData.rank },
		},
		{
			limit: size,
			sort: { "rankingData.rank": 1 },
		},
	)) as Array<MONGO_PBScoreDocument<"usc:Controller" | "usc:Keyboard">>;

	return adjAbove;
}
