import { IsNullish } from "#util/misc";
import React from "react";
import { COLOUR_SET, type MONGO_PBScoreDocument, type MONGO_ScoreDocument } from "tachi-common";

export default function GitadoraJudgementCell({
	score,
}: {
	score:
		| MONGO_PBScoreDocument<"gitadora:Dora" | "gitadora:Gita">
		| MONGO_ScoreDocument<"gitadora:Dora" | "gitadora:Gita">;
}) {
	const judgements = score.scoreData.judgements;

	if (
		IsNullish(judgements.perfect) ||
		IsNullish(judgements.great) ||
		IsNullish(judgements.good) ||
		IsNullish(judgements.ok) ||
		IsNullish(judgements.miss)
	) {
		return <td>No Data.</td>;
	}

	return (
		<td>
			<strong>
				<span style={{ color: COLOUR_SET.gold }}>{judgements.perfect}</span>-
				<span style={{ color: COLOUR_SET.green }}>{judgements.great}</span>-
				<span style={{ color: COLOUR_SET.blue }}>{judgements.good}</span>-
				<span style={{ color: COLOUR_SET.purple }}>{judgements.ok}</span>-
				<span style={{ color: COLOUR_SET.red }}>{judgements.miss}</span>
			</strong>
		</td>
	);
}
