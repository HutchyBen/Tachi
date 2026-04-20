import { FormatTables } from "#util/misc";
import React from "react";
import { type ChartDocument, FormatDifficulty, type SongDocument, type V3Game } from "tachi-common";

export default function IIDXStyleSongChartInfoFormat({
	song,
	chart,
	game,
}: {
	chart: ChartDocument | null;
	game: V3Game;
	song: SongDocument<"bms" | "chunithm" | "iidx" | "maimaidx" | "ongeki" | "pms" | "popn">;
}) {
	return (
		<>
			<h4>{song.data.genre}</h4>
			<h4 style={{ fontSize: "2.5rem", fontWeight: "bold" }}>{song.title}</h4>
			<h4>{song.artist}</h4>
			{chart && <h5>({LevelText(chart)})</h5>}
		</>
	);
}

function LevelText(chart: ChartDocument) {
	if ("tableFolders" in chart.data) {
		const hasLevel = Object.keys(chart.data.tableFolders).length > 0;
		return hasLevel ? FormatTables(chart.data.tableFolders) : "No Level";
	}
	return FormatDifficulty(chart);
}
