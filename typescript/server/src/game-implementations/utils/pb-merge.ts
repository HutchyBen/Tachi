import type { PBMergeFunction } from "#game-implementations/types";
import type { MONGO_PBScoreDocumentNoRank } from "#lib/score-import/framework/pb/create-pb-doc";
import type {
	ConfDerivedMetrics,
	ConfOptionalMetrics,
	ConfProvidedMetrics,
	GPTString,
	MONGO_ScoreDocument,
} from "tachi-common";

import {
	type ScoreDocumentJoinRow,
	SELECT_SCORE_DOCUMENT,
	ToScoreDocument,
} from "#lib/db-formats/score";
import DB from "#services/pg/db";
import { UnixMillisecondsToISO8601 } from "#utils/time.js";
import { sql } from "kysely";

// insane typemagic to get mongodb-safe names for this GPT's metrics.
type MetricKeys<GPT extends GPTString> =
	| {
			metric: keyof ConfDerivedMetrics[GPT];
			type: "DERIVED";
	  }
	| {
			metric: keyof ConfOptionalMetrics[GPT] | keyof ConfProvidedMetrics[GPT];
			type: "REGULAR";
	  };

function metricSortValueSql<GPT extends GPTString>(metric: MetricKeys<GPT>) {
	if (metric.type === "DERIVED") {
		return sql`(score.derived_data::jsonb->>${sql.lit(metric.metric)})::double precision`;
	}

	return sql`(score.data::jsonb->>${sql.lit(metric.metric)})::double precision`;
}

function metricIsNumericSql<GPT extends GPTString>(metric: MetricKeys<GPT>) {
	if (metric.type === "DERIVED") {
		return sql<boolean>`jsonb_typeof(score.derived_data::jsonb -> ${sql.lit(metric.metric)}) = ${sql.lit("number")}`;
	}

	return sql<boolean>`jsonb_typeof(score.data::jsonb -> ${sql.lit(metric.metric)}) = ${sql.lit("number")}`;
}

/**
 * Utility for making a PB merge function. In short, get the best score this user has
 * on this chart for the stated metric, then run the applicator if a score was found.
 *
 * @param direction - Whether to pick the largest value or smallest value for this metric.
 */
export function CreatePBMergeFor<GPT extends GPTString>(
	direction: "largest" | "smallest",
	metric: MetricKeys<GPT>,
	name: string,
	applicator: (base: MONGO_PBScoreDocumentNoRank<GPT>, score: MONGO_ScoreDocument<GPT>) => void,
): PBMergeFunction<GPT> {
	return async (userID, chartID, asOfTimestamp, base) => {
		let q = DB.selectFrom("score")
			.innerJoin("chart", "chart.id", "score.chart_id")
			.innerJoin("song", "song.id", "chart.song_id")
			.leftJoin("import", "import.id", "score.import_id")
			.select(SELECT_SCORE_DOCUMENT)
			.where("score.user_id", "=", userID)
			.where("chart.legacy_id", "=", chartID)
			.where(metricIsNumericSql(metric));

		if (asOfTimestamp !== null) {
			q = q.where(
				sql<boolean>`(score.time_achieved IS NOT NULL AND score.time_achieved < ${UnixMillisecondsToISO8601(asOfTimestamp)})`,
			);
		}

		const sortVal = metricSortValueSql(metric);

		const row = await q
			.orderBy(
				direction === "largest"
					? sql`${sortVal} DESC NULLS LAST`
					: sql`${sortVal} ASC NULLS LAST`,
			)
			.orderBy(sql`score.time_achieved ASC NULLS LAST`)
			.limit(1)
			.executeTakeFirst();

		if (row === undefined) {
			return null;
		}

		const bestScoreFor = ToScoreDocument(
			row as ScoreDocumentJoinRow,
		) as unknown as MONGO_ScoreDocument<GPT>;

		applicator(base, bestScoreFor);

		base.highlight ||= bestScoreFor.highlight;

		if (
			base.timeAchieved !== null &&
			bestScoreFor.timeAchieved !== null &&
			bestScoreFor.timeAchieved > base.timeAchieved
		) {
			base.timeAchieved = bestScoreFor.timeAchieved;
		}

		return {
			name,
			scoreID: bestScoreFor.scoreID,
		};
	};
}
