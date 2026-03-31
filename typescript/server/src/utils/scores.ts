import {
	LoadPbByUserAndChartLegacyId,
	LoadPbServerRecordForChartLegacyId,
} from "#lib/db-formats/pb";
import {
	type integer,
	type MONGO_ChartDocument,
	type MONGO_PBScoreDocument,
	type MONGO_ScoreDocument,
	type MONGO_SongDocument,
	MongoChartLegacyId,
} from "tachi-common";

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
		charts: charts.filter(
			(e) => chartIDs.has(e.chartID) || chartIDs.has(MongoChartLegacyId(e)),
		),
	};
}

export function GetScoreIDsFromComposed(pb: MONGO_PBScoreDocument) {
	const arr = pb.composedFrom.map((e) => e.scoreID);

	return DedupeArr(arr);
}
