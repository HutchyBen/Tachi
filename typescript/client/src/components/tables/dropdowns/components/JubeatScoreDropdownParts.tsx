import React, { useEffect, useRef } from "react";
import {
	COLOUR_SET,
	type MONGO_ChartDocument,
	type MONGO_PBScoreDocument,
	type MONGO_ScoreDocument,
} from "tachi-common";

export function JubeatGraphsComponent({
	score,
	chart,
}: {
	chart: MONGO_ChartDocument<"jubeat:Single">;
	score: MONGO_PBScoreDocument<"jubeat:Single"> | MONGO_ScoreDocument<"jubeat:Single">;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;

		if (!score.scoreData.optional.musicBar) {
			return;
		}

		if (!canvas) {
			return;
		}

		const context = canvas.getContext("2d");

		if (!context) {
			return;
		}

		const size = 5;
		const space = 2;

		context.canvas.height = 60;
		context.canvas.width = 840;

		const colors = [];
		colors[0] = COLOUR_SET.white;
		colors[1] = COLOUR_SET.gray;
		colors[2] = COLOUR_SET.vibrantBlue;
		colors[3] = COLOUR_SET.gold;

		for (let i = 0; i < chart.data.musicBar.length; i++) {
			//X
			context.fillStyle = colors[score.scoreData.optional.musicBar[i]];
			for (let j = 0; j < chart.data.musicBar[i]; j++) {
				//Y
				context.beginPath();
				context.rect(
					space + i * size + i * space,
					context.canvas.height - size * 2 - j * size - j * space,
					size,
					size,
				);
				context.fill();
			}
		}
	}, [score]);

	if (score.scoreData.optional.musicBar) {
		return (
			<>
				<div className="d-flex align-items-center justify-content-center">
					<canvas ref={canvasRef} />
				</div>
			</>
		);
	}

	return (
		<div
			className="d-flex align-items-center justify-content-center"
			style={{ height: "200px" }}
		>
			<span className="text-body-secondary">No gauge data :(</span>
		</div>
	);
}
