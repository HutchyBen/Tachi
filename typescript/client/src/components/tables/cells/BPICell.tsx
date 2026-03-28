import QuickTooltip from "#components/layout/misc/QuickTooltip";
import Divider from "#components/util/Divider";
import Muted from "#components/util/Muted";
import useLUGPTSettings from "#components/util/useLUGPTSettings";
import { UserContext } from "#context/UserContext";
import { GPT_CLIENT_IMPLEMENTATIONS } from "#lib/game-implementations";
import { IsNullish } from "#util/misc";
import React, { useContext } from "react";
import { PoyashiBPI } from "rg-stats";
import {
	GetGrade,
	IIDXLIKE_GBOUNDARIES,
	type integer,
	type MONGO_ChartDocument,
	type MONGO_PBScoreDocument,
	type MONGO_ScoreDocument,
} from "tachi-common";

import MiniTable from "../components/MiniTable";
import DeltaCell from "./DeltaCell";
import ScoreCell from "./ScoreCell";

export default function BPICell({
	score,
	chart,
}: {
	chart: MONGO_ChartDocument<"iidx:DP" | "iidx:SP">;
	score:
		| MONGO_PBScoreDocument<"iidx:DP" | "iidx:SP">
		| MONGO_ScoreDocument<"iidx:DP" | "iidx:SP">;
}) {
	const { user } = useContext(UserContext);
	const { settings } = useLUGPTSettings<"iidx:DP" | "iidx:SP">();

	const bpi = score.calculatedData.BPI;
	const { kaidenAverage, worldRecord, notecount, bpiCoefficient } = chart.data;

	if (IsNullish(score.calculatedData.BPI) || IsNullish(kaidenAverage) || IsNullish(worldRecord)) {
		return <td>N/A</td>;
	}

	const isRequestingUser = user?.id === score.userID;
	const bpiTarget = settings?.preferences.gameSpecific.bpiTarget ?? 0;
	let bpiTargetScore = 0;
	let targetDelta: number | null = 0;

	try {
		bpiTargetScore = PoyashiBPI.inverse(
			bpiTarget,
			kaidenAverage!,
			worldRecord!,
			notecount * 2,
			bpiCoefficient,
		);

		targetDelta = score.scoreData.score - bpiTargetScore;
	} catch (err) {
		console.warn(err);
		// Wasn't possible to get this BPI!
	}

	const kavgDelta = score.scoreData.score - kaidenAverage!;

	const { score: WRAverageCell, delta: WRDeltaCell } = FormatAverage(
		worldRecord!,
		chart.playtype,
		chart.data.notecount,
	);

	const { score: KDAverageCell, delta: KDDeltaCell } = FormatAverage(
		kaidenAverage!,
		chart.playtype,
		chart.data.notecount,
	);

	const { score: TGAverageCell, delta: TGDeltaCell } = FormatAverage(
		bpiTargetScore,
		chart.playtype,
		chart.data.notecount,
	);

	const headers = ["皆伝 Average", "World Record"];

	if (isRequestingUser) {
		headers.unshift(`Your Target (BPI ${bpiTarget})`);
	}

	return (
		<>
			<QuickTooltip
				tooltipContent={
					<>
						<MiniTable headers={headers}>
							<tr>
								{isRequestingUser ? TGAverageCell : null}
								{KDAverageCell}
								{WRAverageCell}
							</tr>
							<tr>
								{isRequestingUser ? TGDeltaCell : null}
								{KDDeltaCell}
								{WRDeltaCell}
							</tr>
						</MiniTable>
						<Divider />
						<Muted>
							BPI Coefficient:{" "}
							{IsNullish(chart.data.bpiCoefficient) ||
							chart.data.bpiCoefficient === -1
								? 1.175
								: chart.data.bpiCoefficient}
						</Muted>
					</>
				}
				wide
			>
				<td>
					<strong className="underline-on-hover">{bpi?.toFixed(2)}</strong>
					<br />

					<div>
						{isRequestingUser ? (
							<>
								<BPITargetCell bpiTarget={bpiTarget} targetDelta={targetDelta} />
								{bpiTarget !== 0 && (
									<>
										<br />
										<Muted>
											皆伝{kavgDelta < 0 ? kavgDelta : `+${kavgDelta}`}
										</Muted>
									</>
								)}
							</>
						) : (
							<>
								<Muted>皆伝{kavgDelta < 0 ? kavgDelta : `+${kavgDelta}`}</Muted>
							</>
						)}
					</div>
				</td>
			</QuickTooltip>
		</>
	);
}

function FormatAverage(score: integer, playtype: "DP" | "SP", notecount: integer) {
	const percent = (100 * score) / (notecount * 2);

	const grade = GetGrade(IIDXLIKE_GBOUNDARIES, percent);

	return {
		score: (
			<ScoreCell
				colour={GPT_CLIENT_IMPLEMENTATIONS[`iidx:${playtype}`].enumColours.grade[grade]}
				grade={grade}
				percent={percent}
				score={score}
			/>
		),
		delta: <DeltaCell grade={grade} gradeBoundaries={IIDXLIKE_GBOUNDARIES} value={percent} />,
	};
}

function BPITargetCell({
	targetDelta,
	bpiTarget,
}: {
	bpiTarget: number;
	targetDelta: number | null;
}) {
	if (targetDelta === null) {
		return <small>BPI{bpiTarget} Not Possible</small>;
	}

	let tag = `${bpiTarget}BPI `;

	if (bpiTarget === 0) {
		tag = "皆伝";
	} else if (bpiTarget === 100) {
		tag = "WR";
	}

	return (
		<small
			className={
				targetDelta < 0
					? "text-danger"
					: targetDelta === 0
						? "text-warning"
						: "text-success"
			}
		>
			{tag}
			{targetDelta < 0 ? targetDelta : `+${targetDelta}`}
		</small>
	);
}
