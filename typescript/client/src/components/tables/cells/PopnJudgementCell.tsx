import { IsNullish } from "#util/misc";
import React from "react";
import { COLOUR_SET, type MONGO_PBScoreDocument, type MONGO_ScoreDocument } from "tachi-common";

export default function PopnJudgementCell({
	score,
}: {
	score: MONGO_PBScoreDocument<"popn:9B"> | MONGO_ScoreDocument<"popn:9B">;
}) {
	const judgements = score.scoreData.judgements;

	if (
		IsNullish(judgements.bad) ||
		IsNullish(judgements.great) ||
		IsNullish(judgements.good) ||
		IsNullish(judgements.cool)
	) {
		return <td>No Data.</td>;
	}

	return (
		<td>
			<strong>
				<span style={{ color: COLOUR_SET.purple }}>{judgements.cool}</span>-
				<span style={{ color: COLOUR_SET.gold }}>{judgements.great}</span>-
				<span style={{ color: COLOUR_SET.red }}>{judgements.good}</span>-
				<span style={{ color: COLOUR_SET.blue }}>{judgements.bad}</span>
			</strong>
		</td>
	);
}
