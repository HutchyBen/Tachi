import { DisplayLevelNum } from "#components/tables/cells/DifficultyCell";
import Muted from "#components/util/Muted";
import React from "react";
import { type ChartDocument, GameToGameGroup, type SongDocument, type V3Game } from "tachi-common";

import DefaultSongChartInfoFormat from "./DefaultSongChartInfoFormat";
import IIDXStyleSongChartInfoFormat from "./IIDXStyleSongChartInfoFormat";

export default function SongChartInfoFormat({
	song,
	chart,
	game,
}: {
	chart: ChartDocument | null;
	game: V3Game;
	song: SongDocument;
}) {
	const gameGroup = GameToGameGroup(game);

	if (["bms", "iidx", "pms", "popn"].includes(gameGroup)) {
		return (
			<IIDXStyleSongChartInfoFormat
				{...{
					song: song as SongDocument<"bms" | "iidx" | "pms" | "popn">,
					chart,
					game,
				}}
			/>
		);
	}
	if (gameGroup === "ongeki" || gameGroup === "chunithm" || gameGroup === "maimaidx") {
		return (
			<>
				<IIDXStyleSongChartInfoFormat
					{...{
						song: song as SongDocument<"chunithm" | "maimaidx" | "ongeki">,
						chart,
						game,
					}}
				/>
				{chart && (
					<>
						<h6>
							<DisplayLevelNum
								game={game}
								level={chart.level}
								levelNum={chart.levelNum}
								prefix="Internal Level: "
							/>
						</h6>
						{"displayVersion" in chart.data ? (
							<h6>
								<Muted>From {chart.data.displayVersion}</Muted>
							</h6>
						) : (
							"displayVersion" in song.data && (
								<h6>
									<Muted>From {song.data.displayVersion}</Muted>
								</h6>
							)
						)}
					</>
				)}
			</>
		);
	}

	return <DefaultSongChartInfoFormat {...{ song, chart, game }} />;
}
