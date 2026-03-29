import type {
	integer,
	MONGO_ChartDocument,
	MONGO_PBScoreDocument,
	MONGO_ScoreDocument,
	MONGO_SongDocument,
} from "tachi-common";

import {
	LoadPbByUserAndChartLegacyId,
	LoadPbServerRecordForChartLegacyId,
} from "#lib/db-formats/pb";

import { DedupeArr } from "./misc";

export function GetPBOnChart(userID: integer, chartID: string) {
	return LoadPbByUserAndChartLegacyId(userID, chartID);
}

export function GetServerRecordOnChart(chartID: string) {
	return LoadPbServerRecordForChartLegacyId(chartID);
}

export function FilterChartsAndSongs(
	scores: Array<MONGO_PBScoreDocument | MONGO_ScoreDocument>,
	charts: Array<MONGO_ChartDocument>,
	songs: Array<MONGO_SongDocument>,
) {
	const chartIDs = new Set();
	const songIDs = new Set();

	for (const score of scores) {
		chartIDs.add(score.chartID);
		songIDs.add(score.songID);
	}

	// filter out irrelevant songs and charts
	return {
		songs: songs.filter((e) => songIDs.has(e.id)),
		charts: charts.filter((e) => chartIDs.has(e.chartID)),
	};
}

export function GetScoreIDsFromComposed(pb: MONGO_PBScoreDocument) {
	const arr = pb.composedFrom.map((e) => e.scoreID);

	return DedupeArr(arr);
}
