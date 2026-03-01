import Icon from "#components/util/Icon";
import useLUGPTSettings from "#components/util/useLUGPTSettings";
import { type SetState } from "#types/react";
import React from "react";

import { type RankingViewMode } from "../cells/RankingCell";
import SortableTH from "./SortableTH";
import { type ZTableTHProps } from "./TachiTable";

export default function SelectableRanking({
	rankingViewMode,
	setRankingViewMode,
	changeSort,
	currentSortMode,
	reverseSort,
}: {
	rankingViewMode: RankingViewMode;
	setRankingViewMode: SetState<RankingViewMode>;
} & ZTableTHProps) {
	const { settings } = useLUGPTSettings();

	if (
		rankingViewMode === "both-if-self" ||
		rankingViewMode === "global-no-switch" ||
		!settings ||
		settings.rivals.length === 0
	) {
		return (
			<SortableTH
				changeSort={changeSort}
				currentSortMode={currentSortMode}
				name="Ranking"
				reverseSort={reverseSort}
				shortName="Ranking"
				sortingName="Site Ranking"
			/>
		);
	}

	return (
		<th>
			<div className="vstack gap-1 align-items-center justify-content-center">
				<select
					className="border-0 p-0.5 text-body fw-bolder rounded focus-ring focus-ring-light bg-transparent"
					onChange={(v) => setRankingViewMode(v.target.value as RankingViewMode)}
					value={rankingViewMode}
				>
					<option value="global">Global Ranking</option>
					<option value="rival">Rival Ranking</option>
				</select>
				<div onClick={() => changeSort("Site Ranking")}>
					<div className="d-flex justify-content-center gap-1">
						<Icon
							className={
								currentSortMode === "Rating" && reverseSort
									? "opacity-100"
									: "opacity-25"
							}
							type="arrow-up"
						/>
						<Icon
							className={
								currentSortMode === "Rating" && !reverseSort
									? "opacity-100"
									: "opacity-25"
							}
							type="arrow-down"
						/>
					</div>
				</div>
			</div>
		</th>
	);
}
