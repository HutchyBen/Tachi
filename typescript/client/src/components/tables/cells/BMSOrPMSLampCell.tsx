import { GetEnumColour } from "#lib/game-implementations";
import { ChangeOpacity } from "#util/color-opacity";
import { IsNotNullish } from "#util/misc";
import React from "react";
import { type PBScoreDocument, type ScoreDocument } from "tachi-common";

type BMSGames = "bms-7k" | "bms-14k" | "pms-controller" | "pms-keyboard";

export default function BMSOrPMSLampCell({
	score,
}: {
	score: PBScoreDocument<BMSGames> | ScoreDocument<BMSGames>;
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
