import useLUGPTSettings from "#components/util/useLUGPTSettings";
import React from "react";
import { type integer } from "rg-stats/js/util/types";
import { type PBScoreDocument } from "tachi-common";

import { rankingColumnTdStyle } from "./ranking-cell-layout";

export type RankingViewMode = "both-if-self" | "global" | "global-no-switch" | "rival";

const lineCls = "d-block text-truncate";

export default function RankingCell({
	rankingData,
	userID,
	rankingViewMode,
}: {
	rankingData: PBScoreDocument["rankingData"];
	rankingViewMode: RankingViewMode;
	userID: integer;
}) {
	const { settings } = useLUGPTSettings();

	switch (rankingViewMode) {
		case "global":
		case "global-no-switch": {
			const title = `#${rankingData.rank} / ${rankingData.outOf}`;
			return (
				<td style={rankingColumnTdStyle} title={title}>
					<div className={lineCls} style={{ minWidth: 0 }}>
						<strong>#{rankingData.rank}</strong>
						<small>/{rankingData.outOf}</small>
					</div>
				</td>
			);
		}
		case "rival": {
			if (!settings) {
				const err =
					"No Settings, yet tried to view rival stats? not possible. how'd you get here. report this.";
				return (
					<td style={rankingColumnTdStyle} title={err}>
						<div className={lineCls} style={{ minWidth: 0, fontSize: "0.7rem" }}>
							{err}
						</div>
					</td>
				);
			}

			if (settings?.userID !== userID) {
				return (
					<td style={rankingColumnTdStyle} title="N/A">
						<div className={lineCls} style={{ minWidth: 0 }}>
							<strong>N/A</strong>
						</div>
					</td>
				);
			}

			const denom = settings.rivals.length + 1;
			const title = `#${rankingData.rivalRank} / ${denom}`;
			return (
				<td style={rankingColumnTdStyle} title={title}>
					<div className={lineCls} style={{ minWidth: 0 }}>
						<strong>#{rankingData.rivalRank}</strong>
						<small>/{denom}</small>
					</div>
				</td>
			);
		}

		case "both-if-self": {
			if (settings?.userID === userID && rankingData.rivalRank !== null) {
				const globalTitle = `Global #${rankingData.rank} / ${rankingData.outOf}`;
				const rivalTitle = `Rival #${rankingData.rivalRank} / ${settings.rivals.length + 1}`;
				const fullTitle = `${globalTitle} — ${rivalTitle}`;
				return (
					<td style={rankingColumnTdStyle} title={fullTitle}>
						<div className={lineCls} style={{ fontSize: "0.76rem", minWidth: 0 }}>
							<strong>Global #{rankingData.rank}</strong>
							<small>/{rankingData.outOf}</small>
						</div>
						<div className={lineCls} style={{ fontSize: "0.76rem", minWidth: 0 }}>
							<strong>Rival #{rankingData.rivalRank}</strong>
							<small>/{settings.rivals.length + 1}</small>
						</div>
					</td>
				);
			}

			const title = `#${rankingData.rank} / ${rankingData.outOf}`;
			return (
				<td style={rankingColumnTdStyle} title={title}>
					<div className={lineCls} style={{ minWidth: 0 }}>
						<strong>#{rankingData.rank}</strong>
						<small>/{rankingData.outOf}</small>
					</div>
				</td>
			);
		}
	}
}
