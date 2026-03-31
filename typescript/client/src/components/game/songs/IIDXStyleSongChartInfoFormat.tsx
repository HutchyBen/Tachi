import { FormatTables } from "#util/misc";
import React from "react";
import {
	FormatDifficulty,
	type GameGroup,
	type MONGO_ChartDocument,
	type MONGO_SongDocument,
} from "tachi-common";

export default function IIDXStyleSongChartInfoFormat({
	song,
	chart,
	game,
}: {
	chart: MONGO_ChartDocument | null;
	game: GameGroup;
	song: MONGO_SongDocument<"bms" | "chunithm" | "iidx" | "maimaidx" | "ongeki" | "pms" | "popn">;
}) {
	return (
		<>
			<h4>{song.data.genre}</h4>
			<h4 style={{ fontSize: "2.5rem", fontWeight: "bold" }}>{song.title}</h4>
			<h4>{song.artist}</h4>
			{chart && <h5>({LevelText(chart, game)})</h5>}
		</>
	);
}

function LevelText(chart: MONGO_ChartDocument, game: GameGroup) {
	if ("tableFolders" in chart.data) {
		const hasLevel = Object.keys(chart.data.tableFolders).length > 0;
		return hasLevel ? FormatTables(chart.data.tableFolders) : "No Level";
	}
	return FormatDifficulty(chart, game);
}
