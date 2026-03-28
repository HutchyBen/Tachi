import HistoryScoreTable from "#components/tables/history-scores/HistoryScoreTable";
import Loading from "#components/util/Loading";
import { type GamePT } from "#types/react";
import { type UnsuccessfulAPIFetchResponse } from "#util/api";
import React from "react";
import { type MONGO_ChartDocument, type MONGO_ScoreDocument } from "tachi-common";

export default function PlayHistory({
	data,
	error,
	game,
	playtype,
	chart,
}: {
	chart: MONGO_ChartDocument;
	data?: MONGO_ScoreDocument[];
	error: UnsuccessfulAPIFetchResponse | null;
} & GamePT) {
	if (error) {
		return <>{error.description}</>;
	}

	if (!data) {
		return <Loading />;
	}

	return (
		<div className="col-12">
			<HistoryScoreTable chart={chart} dataset={data} game={game} playtype={playtype} />
		</div>
	);
}
