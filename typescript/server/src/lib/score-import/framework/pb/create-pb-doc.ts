import type { KtLogger } from "#lib/log/log";
import type { Game } from "tachi-db";

import { GPT_SERVER_IMPLEMENTATIONS } from "#game-implementations/game-implementations";
import { SELECT_PB_ROW } from "#lib/db-formats/pb";
import {
	type ScoreDocumentJoinRow,
	SELECT_SCORE_DOCUMENT,
	ToScoreDocument,
} from "#lib/db-formats/score";
import { GetEveryonesRivalIDs } from "#lib/rivals/rivals";
import DB from "#services/pg/db";
import { DeleteUndefinedProps } from "#utils/misc";
import { UnixMillisecondsToISO8601 } from "#utils/time";
import { sql } from "kysely";
import {
	type GameGroup,
	GamePTToV3,
	GetGPTConfig,
	type GPTString,
	type integer,
	type MONGO_ChartDocument,
	type MONGO_ScoreDocument,
	MongoChartLegacyId,
	type Playtype,
} from "tachi-common";

import type { MONGO_PBScoreDocumentNoRank } from "./upsert-pb-pg";

import { CreateScoreCalcData } from "../calculated-data/score";
import { scoreVisibleSql } from "../pg/score-visibility";
import { CreateEnumIndexes } from "../score-importing/derivers";

export type { MONGO_PBScoreDocumentNoRank };

async function findBestScoreForPb(
	gpt: GPTString,
	userID: integer,
	chart: MONGO_ChartDocument,
	asOfTimestamp: number | undefined,
): Promise<MONGO_ScoreDocument | null> {
	const gptConfig = GetGPTConfig(gpt);
	const metricKey = String(gptConfig.defaultMetric);

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
	gpt: GPTString,
	userID: integer,
	chart: MONGO_ChartDocument,
	log: KtLogger,
	asOfTimestamp?: number,
) {
	const chartID = MongoChartLegacyId(chart);

	const defaultMetricPB = await findBestScoreForPb(gpt, userID, chart, asOfTimestamp);

	if (!defaultMetricPB) {
		if (asOfTimestamp !== undefined) {
			return;
		}

		log.warn(
			{
				chartID,
				userID,
			},
			`User ${userID} has no scores on chart, but a PB was attempted to be created?`,
		);
		return;
	}

	const gptImpl = GPT_SERVER_IMPLEMENTATIONS[gpt];

	const pbDoc: MONGO_PBScoreDocumentNoRank = {
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
		playtype: defaultMetricPB.playtype,
		isPrimary: defaultMetricPB.isPrimary,
		scoreData: defaultMetricPB.scoreData,
		calculatedData: defaultMetricPB.calculatedData,
	};

	for (const mergeFn of gptImpl.pbMergeFunctions) {
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

	const { indexes, optionalIndexes } = CreateEnumIndexes(gpt, pbDoc.scoreData, log);

	pbDoc.scoreData.enumIndexes = indexes;
	pbDoc.scoreData.optional.enumIndexes = optionalIndexes;

	pbDoc.calculatedData = CreateScoreCalcData(pbDoc.game, pbDoc.scoreData, chart);

	return pbDoc;
}

/**
 * Persists rival-only ranking hints. Global rank / outOf come from `chart_leaderboard` at read time.
 */
export async function UpdateChartRanking(game: GameGroup, playtype: Playtype, chartID: string) {
	const userIds = await getSortedPbUserIdsOnChart(game, playtype, chartID);

	const allRivals = await GetEveryonesRivalIDs(game, playtype);

	const seenUserIDs: Array<integer> = [];

	const v3Game = GamePTToV3(game, playtype) as Game;

	const chartRow = await DB.selectFrom("chart")
		.select("id")
		.where("chart.id", "=", chartID)
		.where("chart.game", "=", v3Game)
		.executeTakeFirst();

	if (!chartRow) {
		return;
	}

	for (const userId of userIds) {
		seenUserIDs.push(userId);

		const thisUsersRivals = allRivals[userId];

		let rivalRank: integer | null = null;

		if (thisUsersRivals && thisUsersRivals.length > 0) {
			rivalRank = thisUsersRivals.filter((e) => seenUserIDs.includes(e)).length + 1;
		}

		const pbRow = await DB.selectFrom("pb")
			.select(SELECT_PB_ROW)
			.where("pb.user_id", "=", userId)
			.where("pb.chart_id", "=", chartRow.id)
			.where("pb.lens", "is", null)
			.executeTakeFirst();

		if (!pbRow) {
			continue;
		}

		const raw = pbRow.calculated_data;
		const cd =
			typeof raw === "string"
				? (JSON.parse(raw) as Record<string, unknown>)
				: ((raw ?? {}) as Record<string, unknown>);
		delete cd.rank;
		delete cd.outOf;

		await DB.updateTable("pb")
			.set({
				calculated_data: JSON.stringify({
					...cd,
					rivalRank,
				}),
			})
			.where("row_id", "=", pbRow.row_id)
			.execute();
	}
}

async function getSortedPbUserIdsOnChart(game: GameGroup, playtype: Playtype, chartID: string) {
	const v3Game = GamePTToV3(game, playtype) as Game;

	const rows = await DB.selectFrom("pb")
		.innerJoin("chart", "chart.id", "pb.chart_id")
		.innerJoin("song", "song.id", "chart.song_id")
		.select("pb.user_id")
		.where((eb) => eb.or([eb("chart.id", "=", chartID), eb("chart.legacy_id", "=", chartID)]))
		.where("chart.game", "=", v3Game)
		.orderBy("pb.ranking_value", "desc")
		.orderBy(sql`pb.ranking_value_tb1 DESC NULLS LAST`)
		.orderBy(sql`pb.ranking_value_tb2 DESC NULLS LAST`)
		.orderBy(sql`pb.ranking_value_tb3 DESC NULLS LAST`)
		.orderBy(sql`pb.ranking_value_tb4 DESC NULLS LAST`)
		.orderBy(sql`pb.ranking_value_tb5 DESC NULLS LAST`)
		.orderBy("pb.time_achieved", "asc")
		.execute();

	return rows.map((r) => r.user_id);
}

export { upsertPbFromMongoDoc } from "./upsert-pb-pg";
