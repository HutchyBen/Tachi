import { GetEnumColour } from "#lib/game-implementations";
import { ChangeOpacity } from "#util/color-opacity";
import React from "react";
import { type MONGO_PBScoreDocument, type MONGO_ScoreDocument } from "tachi-common";

// Lamp cell, but if the lamp is FAILED, display it slightly differently.
export default function SDVXLampCell({
	score,
}: {
	score:
		| MONGO_PBScoreDocument<"sdvx:Single" | "usc:Controller" | "usc:Keyboard">
		| MONGO_ScoreDocument<"sdvx:Single" | "usc:Controller" | "usc:Keyboard">;
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
