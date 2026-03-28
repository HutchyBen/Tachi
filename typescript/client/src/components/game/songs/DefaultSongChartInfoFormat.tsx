import { DisplayLevelNum } from "#components/tables/cells/DifficultyCell";
import React from "react";
import {
	FormatDifficulty,
	type GameGroup,
	type MONGO_ChartDocument,
	type MONGO_SongDocument,
} from "tachi-common";

export default function DefaultSongChartInfoFormat({
	song,
	chart,
	game,
}: {
	chart: MONGO_ChartDocument | null;
	game: GameGroup;
	song: MONGO_SongDocument;
}) {
	return (
		<>
			<h4>
				{song.artist} - {song.title}
			</h4>
			{chart && (
				<>
					<h5>({FormatDifficulty(chart, game)})</h5>
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
