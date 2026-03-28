import GekichumaiScoreChart from "#components/charts/GekichumaiScoreChart";
import useApiQuery from "#components/util/query/useApiQuery";
import SelectNav from "#components/util/SelectNav";
import { type SetState } from "#types/react";
import React, { useState } from "react";
import { Nav } from "react-bootstrap";
import {
	type Difficulties,
	type MONGO_ChartDocument,
	type MONGO_PBScoreDocument,
	type MONGO_ScoreData,
	type MONGO_ScoreDocument,
	type MONGO_SongDocument,
} from "tachi-common";

type ChartType = "Life" | "Score";

export function MaimaiDXGraphsComponent({
	score,
	chart,
}: {
	chart: MONGO_ChartDocument<"maimaidx:Single">;
	score: MONGO_PBScoreDocument<"maimaidx:Single"> | MONGO_ScoreDocument<"maimaidx:Single">;
}) {
	const [graph, setGraph] = useState<ChartType>("Score");
	const { percentGraph, lifeGraph } = score.scoreData.optional;

	if (!percentGraph && !lifeGraph) {
		return <Box message="No charts available" />;
	}

	return (
		<Inner
			chart={chart}
			graph={graph}
			lifeGraph={lifeGraph}
			percentGraph={percentGraph}
			score={score}
			setGraph={setGraph}
		/>
	);
}

function Inner({
	score,
	chart,
	graph,
	setGraph,
	percentGraph,
	lifeGraph,
}: {
	chart: MONGO_ChartDocument<"maimaidx:Single">;
	graph: ChartType;
	lifeGraph: (number | null)[] | null | undefined;
	percentGraph: (number | null)[] | null | undefined;
	score: MONGO_PBScoreDocument<"maimaidx:Single"> | MONGO_ScoreDocument<"maimaidx:Single">;
	setGraph: SetState<ChartType>;
}) {
	const { data, error } = useApiQuery<{
		song: MONGO_SongDocument<"maimaidx">;
	}>(`/games/maimaidx/Single/songs/${score.songID}`);

	if (error !== null || data === undefined) {
		return <Box message="Error retrieving chart" />;
	}

	if (!data.song.data.duration) {
		return <Box message="No charts available" />;
	}

	return (
		<>
			<div className="col-12 d-flex justify-content-center">
				<Nav variant="pills">
					{percentGraph && (
						<SelectNav id={"Score" as const} setValue={setGraph} value={graph}>
							Percent
						</SelectNav>
					)}
					{lifeGraph && (
						<SelectNav id={"Life" as const} setValue={setGraph} value={graph}>
							Life
						</SelectNav>
					)}
				</Nav>
			</div>
			<div className="col-12">
				<GraphComponent
					difficulty={chart.difficulty}
					scoreData={score.scoreData}
					song={data.song}
					type={graph}
				/>
			</div>
		</>
	);
}

function GraphComponent({
	scoreData,
	song,
	difficulty,
	type,
}: {
	difficulty: Difficulties["maimaidx:Single"];
	scoreData: MONGO_ScoreData<"maimaidx:Single">;
	song: MONGO_SongDocument<"maimaidx">;
	type: ChartType;
}) {
	const values =
		type === "Score" ? scoreData.optional.percentGraph! : scoreData.optional.lifeGraph!;
	return (
		<GekichumaiScoreChart
			data={[
				{
					id: type,
					data: values.map((e, i) => ({ x: i, y: e })),
				},
			]}
			difficulty={difficulty}
			duration={song.data.duration!}
			game="maimaidx"
			height="360px"
			mobileHeight="175px"
			type={type}
		/>
	);
}

function Box({ message }: { message: string }) {
	return (
		<div className="col-12">
			<div
				className="d-flex align-items-center justify-content-center"
				style={{ height: "200px" }}
			>
				<span className="text-body-secondary">{message}</span>
			</div>
		</div>
	);
}
