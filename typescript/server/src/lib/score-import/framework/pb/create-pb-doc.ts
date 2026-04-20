import type { KtLogger } from "#lib/log/log";

import { GAME_IMPLEMENTATIONS } from "#game-implementations/game-implementations";
import {
	type ScoreDocumentJoinRow,
	SELECT_SCORE_DOCUMENT,
	ToScoreDocument,
} from "#lib/db-formats/score";
import DB from "#services/pg/db";
import { DeleteUndefinedProps } from "#utils/misc";
import { UnixMillisecondsToISO8601 } from "#utils/time";
import { sql } from "kysely";
import {
	type ChartDocument,
	GetGameConfig,
	type integer,
	type ScoreDocument,
	type V3Game,
} from "tachi-common";

import type { PBScoreDocumentNoRank } from "./upsert-pb-pg";

import { CreateScoreCalcData } from "../calculated-data/score";
import { scoreVisibleSql } from "../pg/score-visibility";
import { CreateEnumIndexes } from "../score-importing/derivers";

export type { PBScoreDocumentNoRank };

async function findBestScoreForPb(
	game: V3Game,
	userID: integer,
	chart: ChartDocument,
	asOfTimestamp: number | undefined,
): Promise<ScoreDocument | null> {
	const gameConfig = GetGameConfig(game);
	const metricKey = String(gameConfig.defaultMetric);

	const sortVal = sql`(score.data::jsonb->>${sql.lit(metricKey)})::double precision`;

	let q = DB.selectFrom("score")
		.innerJoin("chart", "chart.id", "score.chart_id")
		.innerJoin("song", "song.id", "chart.song_id")
		.leftJoin("import", "import.id", "score.import_id")
		.select(SELECT_SCORE_DOCUMENT)
		.where("score.user_id", "=", userID)
		.where("chart.id", "=", chart.chartID)
		.where(scoreVisibleSql());

	if (asOfTimestamp !== undefined) {
		q = q.where("score.time_achieved", "<", UnixMillisecondsToISO8601(asOfTimestamp));
	}

	const row = await q
		.orderBy(sortVal, "desc")
		.orderBy("score.time_achieved", "asc")
		.limit(1)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return ToScoreDocument(row as ScoreDocumentJoinRow);
}

/**
 * Create a PB document for this user on this chart. Optionally, provide an "As Of"
 * timestamp to constrain the generated PB to only one before the provided time.
 */
export async function CreatePBDoc(
	game: V3Game,
	userID: integer,
	chart: ChartDocument,
	log: KtLogger,
	asOfTimestamp?: number,
) {
	const defaultMetricPB = await findBestScoreForPb(game, userID, chart, asOfTimestamp);

	if (!defaultMetricPB) {
		if (asOfTimestamp !== undefined) {
			return;
		}

		log.warn(
			{
				chartID: chart.chartID,
				userID,
			},
			`User ${userID} has no scores on chart, but a PB was attempted to be created?`,
		);
		return;
	}

	const gptImpl = GAME_IMPLEMENTATIONS[game];

	const pbDoc: PBScoreDocumentNoRank = {
		composedFrom: [
			{
				name: gptImpl.defaultMergeRefName,
				scoreID: defaultMetricPB.scoreID,
			},
		],
		chartID: defaultMetricPB.chartID,
		userID,
		songID: defaultMetricPB.songID,
		highlight: defaultMetricPB.highlight,
		timeAchieved: defaultMetricPB.timeAchieved,
		game: defaultMetricPB.game,
		isPrimary: defaultMetricPB.isPrimary,
		scoreData: defaultMetricPB.scoreData,
		calculatedData: defaultMetricPB.calculatedData,
	};

	for (const mergeFn of gptImpl.pbMergeFunctions) {
		// eslint-disable-next-line no-await-in-loop
		const ref = await mergeFn(
			userID,
			defaultMetricPB.chartID,
			asOfTimestamp ?? null,
			pbDoc as never,
		);

		if (ref && !pbDoc.composedFrom.map((e) => e.scoreID).includes(ref.scoreID)) {
			pbDoc.composedFrom.push(ref);
		}
	}

	DeleteUndefinedProps(pbDoc.scoreData.optional);

	const { indexes, optionalIndexes } = CreateEnumIndexes(game, pbDoc.scoreData, log);

	pbDoc.scoreData.enumIndexes = indexes;
	pbDoc.scoreData.optional.enumIndexes = optionalIndexes;

	pbDoc.calculatedData = CreateScoreCalcData(pbDoc.scoreData, chart);

	return pbDoc;
}

export async function UpdateChartRanking(_game: V3Game, _chartID: string) {
	// nothing. rivals don't go in calculated data, thanks claude.
}

export { upsertPbFromMongoDoc } from "./upsert-pb-pg";
