import Icon from "#components/util/Icon";
import useLUGPTSettings from "#components/util/useLUGPTSettings";
import { type SetState } from "#types/react";
import React from "react";

import { rankingColumnThStyle } from "../cells/ranking-cell-layout";
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
				style={rankingColumnThStyle}
			/>
		);
	}

	const sortHighlighted = currentSortMode === "Site Ranking";

	return (
		<th style={rankingColumnThStyle}>
			<div
				className="vstack gap-0 justify-content-center"
				style={{ marginInline: "auto", maxWidth: "100%", minWidth: 0 }}
			>
				<select
					aria-label="Ranking scope"
					className="border-0 fw-bolder rounded focus-ring focus-ring-light bg-transparent text-body p-0"
					onChange={(v) => setRankingViewMode(v.target.value as RankingViewMode)}
					style={{
						display: "block",
						fontSize: "0.55rem",
						lineHeight: 1.1,
						maxWidth: "100%",
						width: "100%",
					}}
					title={rankingViewMode === "rival" ? "Rival Ranking" : "Global Ranking"}
					value={rankingViewMode}
				>
					<option value="global">Global</option>
					<option value="rival">Rival</option>
				</select>
				<div
					className="d-flex justify-content-center"
					onClick={() => changeSort("Site Ranking")}
				>
					<div className="d-flex justify-content-center gap-0">
						<Icon
							className={
								sortHighlighted && reverseSort ? "opacity-100" : "opacity-25"
							}
							type="arrow-up"
						/>
						<Icon
							className={
								sortHighlighted && !reverseSort ? "opacity-100" : "opacity-25"
							}
							type="arrow-down"
						/>
					</div>
				</div>
			</div>
		</th>
	);
}
