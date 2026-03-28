import { IsNullish } from "#util/misc";
import React from "react";
import { COLOUR_SET, type MONGO_PBScoreDocument, type MONGO_ScoreDocument } from "tachi-common";

export default function MaimaiDXJudgementCell({
	score,
}: {
	score: MONGO_PBScoreDocument<"maimaidx:Single"> | MONGO_ScoreDocument<"maimaidx:Single">;
}) {
	const judgements = score.scoreData.judgements;

	if (
		IsNullish(judgements.miss) ||
		IsNullish(judgements.great) ||
		IsNullish(judgements.good) ||
		IsNullish(judgements.pcrit) ||
		IsNullish(judgements.perfect)
	) {
		return <td>No Data.</td>;
	}

	return (
		<td>
			<strong>
				<span style={{ color: COLOUR_SET.vibrantYellow }}>{judgements.pcrit}</span>-
				<span style={{ color: COLOUR_SET.orange }}>{judgements.perfect}</span>-
				<span style={{ color: COLOUR_SET.pink }}>{judgements.great}</span>-
				<span style={{ color: COLOUR_SET.green }}>{judgements.good}</span>-
				<span style={{ color: COLOUR_SET.gray }}>{judgements.miss}</span>
			</strong>
		</td>
	);
}
