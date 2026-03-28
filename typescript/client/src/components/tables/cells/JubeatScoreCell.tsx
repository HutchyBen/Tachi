import { GPT_CLIENT_IMPLEMENTATIONS } from "#lib/game-implementations";
import { ChangeOpacity } from "#util/color-opacity";
import { FormatMillions, ToFixedFloor } from "#util/misc";
import React from "react";
import { type MONGO_PBScoreDocument, type MONGO_ScoreDocument } from "tachi-common";

export default function JubeatScoreCell({
	sc,
}: {
	sc: MONGO_PBScoreDocument<"jubeat:Single"> | MONGO_ScoreDocument<"jubeat:Single">;
}) {
	return (
		<td
			style={{
				backgroundColor: ChangeOpacity(
					GPT_CLIENT_IMPLEMENTATIONS["jubeat:Single"].enumColours.grade[
						sc.scoreData.grade
					],
					0.2,
				),
			}}
		>
			<strong>{sc.scoreData.grade}</strong>
			<br />
			<b>{ToFixedFloor(sc.scoreData.musicRate, 2)}%</b>
			<br />
			{FormatMillions(sc.scoreData.score)}
		</td>
	);
}
