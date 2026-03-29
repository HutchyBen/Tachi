import type { MONGO_PBScoreDocument } from "tachi-common";

import { LoadPbsAdjacentByChartRank } from "#lib/db-formats/pb";

export function GetAdjacentAbove(userPB: MONGO_PBScoreDocument, size = 5) {
	return LoadPbsAdjacentByChartRank(
		userPB.chartID,
		userPB.rankingData.rank,
		"above",
		size,
	) as Promise<Array<MONGO_PBScoreDocument<"usc:Controller" | "usc:Keyboard">>>;
}

export function GetAdjacentBelow(userPB: MONGO_PBScoreDocument, size = 5) {
	return LoadPbsAdjacentByChartRank(
		userPB.chartID,
		userPB.rankingData.rank,
		"below",
		size,
	) as Promise<Array<MONGO_PBScoreDocument<"usc:Controller" | "usc:Keyboard">>>;
}
