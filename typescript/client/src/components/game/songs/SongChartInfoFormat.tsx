import { DisplayLevelNum } from "#components/tables/cells/DifficultyCell";
import Muted from "#components/util/Muted";
import React from "react";
import { type GameGroup, type MONGO_ChartDocument, type MONGO_SongDocument } from "tachi-common";

import DefaultSongChartInfoFormat from "./DefaultSongChartInfoFormat";
import IIDXStyleSongChartInfoFormat from "./IIDXStyleSongChartInfoFormat";

export default function SongChartInfoFormat({
	song,
	chart,
	game,
}: {
	chart: MONGO_ChartDocument | null;
	game: GameGroup;
	song: MONGO_SongDocument;
}) {
	if (["bms", "iidx", "pms", "popn"].includes(game)) {
		return (
			<IIDXStyleSongChartInfoFormat
				{...{
					song: song as MONGO_SongDocument<"bms" | "iidx" | "pms" | "popn">,
					chart,
					game,
				}}
			/>
		);
	}
	if (game === "ongeki" || game === "chunithm" || game === "maimaidx") {
		return (
			<>
				<IIDXStyleSongChartInfoFormat
					{...{
						song: song as MONGO_SongDocument<"chunithm" | "maimaidx" | "ongeki">,
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
