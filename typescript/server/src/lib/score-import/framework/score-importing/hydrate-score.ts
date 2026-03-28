import type { KtLogger } from "#lib/log/log";

import {
	GetGPTString,
	type integer,
	type MONGO_ChartDocument,
	type MONGO_ScoreDocument,
	type MONGO_SongDocument,
	MongoChartLegacyId,
} from "tachi-common";

import type { DryScore } from "../common/types";

import { CreateScoreCalcData } from "../calculated-data/score";
import { CreateFullScoreData } from "./derivers";

/**
 * Takes an "intermediate" score and appends the rest of the data it needs.
 * @param dryScore The intermediate score to make into a real score.
 * @param userID The userID this score is for.
 */
export function HydrateScore(
	userID: integer,
	dryScore: DryScore,
	chart: MONGO_ChartDocument,
	song: MONGO_SongDocument,
	scoreID: string,
	log: KtLogger,
): MONGO_ScoreDocument {
	const gpt = GetGPTString(dryScore.game, chart.playtype);

	const scoreData = CreateFullScoreData(gpt, dryScore.scoreData, chart, log);

	const calculatedData = CreateScoreCalcData(dryScore.game, dryScore.scoreData, chart);

	const score: MONGO_ScoreDocument = {
		...dryScore,

		// then push our new score data.
		scoreData,

		// everything below this point is sane
		highlight: false,
		timeAdded: Date.now(),
		userID,
		calculatedData,
		songID: song.id,
		chartID: MongoChartLegacyId(chart),
		scoreID,
		playtype: chart.playtype,
		isPrimary: chart.isPrimary,
	};

	return score;
}
