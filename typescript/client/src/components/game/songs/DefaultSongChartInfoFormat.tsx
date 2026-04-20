import { DisplayLevelNum } from "#components/tables/cells/DifficultyCell";
import React from "react";
import { type ChartDocument, FormatDifficulty, type SongDocument, type V3Game } from "tachi-common";

export default function DefaultSongChartInfoFormat({
	song,
	chart,
	game,
}: {
	chart: ChartDocument | null;
	game: V3Game;
	song: SongDocument;
}) {
	return (
		<>
			<h4>
				{song.artist} - {song.title}
			</h4>
			{chart && (
				<>
					<h5>({FormatDifficulty(chart)})</h5>
					<h6>
						<DisplayLevelNum
							game={game}
							level={chart.level}
							levelNum={chart.levelNum}
							prefix="Internal Level: "
						/>
					</h6>
				</>
			)}
		</>
	);
}
