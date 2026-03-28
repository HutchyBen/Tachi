import { type SetState } from "#types/react";
import { NumericSOV } from "#util/sorts";
import React from "react";
import { type MONGO_PBScoreDocument } from "tachi-common";

import { type RankingViewMode } from "../cells/RankingCell";
import SelectableRanking from "../components/SelectableRanking";
import { type Header, type ZTableTHProps } from "../components/TachiTable";

export function CreateRankingHeader<T>(
	rankingViewMode: RankingViewMode,
	setRankingViewMode: SetState<RankingViewMode>,
	kMapToRankingData: (k: T) => MONGO_PBScoreDocument["rankingData"] | undefined,
): Header<T> {
	return [
		"Site Ranking",
		"Site Ranking",

		NumericSOV((x) => {
			const rankingData = kMapToRankingData(x);

			if (!rankingData) {
				return -Infinity;
			}

			return rankingViewMode === "rival"
				? (rankingData.rivalRank ?? -Infinity)
				: rankingData.rank;
		}),
		(thProps: ZTableTHProps) => (
			<SelectableRanking
				rankingViewMode={rankingViewMode}
				setRankingViewMode={setRankingViewMode}
				{...thProps}
			/>
		),
	];
}
