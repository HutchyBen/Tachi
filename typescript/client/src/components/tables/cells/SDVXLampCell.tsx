import { GetEnumColour } from "#lib/game-implementations";
import { ChangeOpacity } from "#util/color-opacity";
import React from "react";
import { type PBScoreDocument, type ScoreDocument } from "tachi-common";

// Lamp cell, but if the lamp is FAILED, display it slightly differently.
export default function SDVXLampCell({
	score,
}: {
	score:
		| PBScoreDocument<"sdvx" | "usc-controller" | "usc-keyboard">
		| ScoreDocument<"sdvx" | "usc-controller" | "usc-keyboard">;
}) {
	return (
		<td
			style={{
				backgroundColor: ChangeOpacity(GetEnumColour(score, "lamp"), 0.2),
				whiteSpace: "nowrap",
			}}
		>
			<strong>{score.scoreData.lamp === "FAILED" ? "PLAYED" : score.scoreData.lamp}</strong>
		</td>
	);
}
