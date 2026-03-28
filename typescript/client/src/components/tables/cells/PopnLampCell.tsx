import { GPT_CLIENT_IMPLEMENTATIONS } from "#lib/game-implementations";
import { ChangeOpacity } from "#util/color-opacity";
import React from "react";
import { type MONGO_PBScoreDocument, type MONGO_ScoreDocument } from "tachi-common";

export default function PopnLampCell({
	score,
}: {
	score: MONGO_PBScoreDocument<"popn:9B"> | MONGO_ScoreDocument<"popn:9B">;
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
