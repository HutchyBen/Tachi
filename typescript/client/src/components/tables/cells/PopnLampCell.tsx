import { GPT_CLIENT_IMPLEMENTATIONS } from "#lib/game-implementations";
import { ChangeOpacity } from "#util/color-opacity";
import React from "react";
import { type PBScoreDocument, type ScoreDocument } from "tachi-common";

export default function PopnLampCell({
	score,
}: {
	score: PBScoreDocument<"popn:9B"> | ScoreDocument<"popn:9B">;
}) {
	return (
		<td
			style={{
				backgroundColor: ChangeOpacity(
					GPT_CLIENT_IMPLEMENTATIONS["popn:9B"].enumColours.lamp[score.scoreData.lamp],
					0.2,
				),
				whiteSpace: "nowrap",
			}}
		>
			<strong>{score.scoreData.lamp}</strong>
		</td>
	);
}
