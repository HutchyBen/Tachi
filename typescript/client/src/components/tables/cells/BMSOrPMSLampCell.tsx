import { GetEnumColour } from "#lib/game-implementations";
import { ChangeOpacity } from "#util/color-opacity";
import { IsNotNullish } from "#util/misc";
import React from "react";
import { type MONGO_PBScoreDocument, type MONGO_ScoreDocument } from "tachi-common";

export default function BMSOrPMSLampCell({
	score,
}: {
	score:
		| MONGO_PBScoreDocument<"bms:7K" | "bms:14K" | "pms:Controller" | "pms:Keyboard">
		| MONGO_ScoreDocument<"bms:7K" | "bms:14K" | "pms:Controller" | "pms:Keyboard">;
}) {
	return (
		<td
			style={{
				backgroundColor: ChangeOpacity(GetEnumColour(score, "lamp"), 0.2),
				whiteSpace: "nowrap",
			}}
		>
			<strong>{score.scoreData.lamp}</strong>
			{IsNotNullish(score.scoreData.optional.bp) && (
				<>
					<br />
					<small>[BP: {score.scoreData.optional.bp}]</small>
				</>
			)}
		</td>
	);
}
