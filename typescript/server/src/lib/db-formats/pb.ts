import type { Game } from "tachi-db";

import { pgScoreDataToMongo } from "#lib/v3/migration-tools";
import DB from "#services/pg/db";
import { ISO8601ToUnixMilliseconds } from "#utils/time";
import { sql } from "kysely";
import {
	type GameGroup,
	type MONGO_PBScoreDocument,
	type PBReference,
	type Playtype,
	type V3Game,
	V3ToGamePT,
} from "tachi-common";

/** Row shape from `pb` joined with `chart` and `song` for building a {@link MONGO_PBScoreDocument}. */
export interface PbDocumentJoinRow {
	row_id: string;
	user_id: number;
	chart_id: string;
	lens: string | null;
	data: unknown;
	derived_data: unknown;
	calculated_data: unknown;
	ranking_value: number;
	ranking_value_tb1: number | null;
	ranking_value_tb2: number | null;
	ranking_value_tb3: number | null;
	ranking_value_tb4: number | null;
	ranking_value_tb5: number | null;
	highlight: boolean;
	time_achieved: string | null;
	chart_legacy_id: string;
	song_legacy_id: number;
	chart_game: Game;
	is_primary: boolean;
}

/** Columns for `pb` joined with `chart` and `song` (same shape as {@link PbDocumentJoinRow}). */
export const SELECT_PB_DOCUMENT_JOIN = [
	"pb.row_id",
	"pb.user_id",
	"pb.chart_id",
	"pb.lens",
	"pb.data",
	"pb.derived_data",
	"pb.calculated_data",
	"pb.ranking_value",
	"pb.ranking_value_tb1",
	"pb.ranking_value_tb2",
	"pb.ranking_value_tb3",
	"pb.ranking_value_tb4",
	"pb.ranking_value_tb5",
	"pb.highlight",
	"pb.time_achieved",
	"chart.legacy_id as chart_legacy_id",
	"song.legacy_id as song_legacy_id",
	"chart.game as chart_game",
	"chart.is_primary as is_primary",
] as const;

/**
 * Maps a Postgres `pb` row (+ chart/song join columns) to the legacy Mongo PB document shape.
 */
export async function ToPbScoreDocument(row: PbDocumentJoinRow): Promise<MONGO_PBScoreDocument> {
	const { game, playtype } = V3ToGamePT(row.chart_game as V3Game);

	const composedRows = await DB.selectFrom("pb_composed_from")
		.where("pb_id", "=", row.row_id)
		.select("score_id")
		.execute();

	const composedFrom: [PBReference, ...PBReference[]] =
		composedRows.length > 0
			? (composedRows.map((c, i) => ({
					name: i === 0 ? "Primary" : `Merge${i}`,
					scoreID: c.score_id,
				})) as [PBReference, ...PBReference[]])
			: [{ name: "Primary", scoreID: "unknown" }];

	const scoreData = pgScoreDataToMongo(
		row.chart_game as V3Game,
		{
			data: row.data,
			derived: row.derived_data,
			judgements: {},
		} as Parameters<typeof pgScoreDataToMongo>[1],
	);

	const cd = (row.calculated_data ?? {}) as { rank?: number };
	const rank = typeof cd.rank === "number" ? cd.rank : 0;

	return {
		composedFrom,
		rankingData: { outOf: 0, rank, rivalRank: null },
		userID: row.user_id,
		chartID: row.chart_legacy_id,
		game: game as GameGroup,
		playtype: playtype as Playtype,
		songID: row.song_legacy_id,
		highlight: row.highlight,
		isPrimary: row.is_primary,
		timeAchieved: row.time_achieved ? ISO8601ToUnixMilliseconds(row.time_achieved) : null,
		scoreData,
		calculatedData: (row.calculated_data ?? {}) as MONGO_PBScoreDocument["calculatedData"],
	};
}

/** Best PB for a user on a chart (by legacy chart id). */
export async function LoadPbByUserAndChartLegacyId(
	userId: number,
	chartLegacyId: string,
): Promise<MONGO_PBScoreDocument | null> {
	const row = await DB.selectFrom("pb")
		.innerJoin("chart", "chart.id", "pb.chart_id")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_PB_DOCUMENT_JOIN)
		.where("pb.user_id", "=", userId)
		.where("chart.legacy_id", "=", chartLegacyId)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return ToPbScoreDocument(row as PbDocumentJoinRow);
}

/**
 * Top-ranked PB on a chart (best `ranking_value`), used as a stand-in for Mongo
 * `rankingData.rank === 1` server-record semantics when per-user rank is populated separately.
 */
export async function LoadPbServerRecordForChartLegacyId(
	chartLegacyId: string,
): Promise<MONGO_PBScoreDocument | null> {
	const row = await DB.selectFrom("pb")
		.innerJoin("chart", "chart.id", "pb.chart_id")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_PB_DOCUMENT_JOIN)
		.where("chart.legacy_id", "=", chartLegacyId)
		.orderBy("pb.ranking_value", "desc")
		.limit(1)
		.executeTakeFirst();

	if (!row) {
		return null;
	}

	return ToPbScoreDocument(row as PbDocumentJoinRow);
}

/** PBs on a chart with `calculated_data.rank` strictly above / below the user’s rank (USC-style ladders). */
export async function LoadPbsAdjacentByChartRank(
	chartLegacyId: string,
	userRank: number,
	dir: "above" | "below",
	limit: number,
): Promise<Array<MONGO_PBScoreDocument>> {
	const rankExpr = sql<number>`(pb.calculated_data::jsonb->>'rank')::double precision`;
	const cmp =
		dir === "above"
			? sql<boolean>`${rankExpr} < ${userRank}`
			: sql<boolean>`${rankExpr} > ${userRank}`;
	const order = dir === "above" ? ("desc" as const) : ("asc" as const);

	const q = DB.selectFrom("pb")
		.innerJoin("chart", "chart.id", "pb.chart_id")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_PB_DOCUMENT_JOIN)
		.where("chart.legacy_id", "=", chartLegacyId)
		.where(
			sql<boolean>`jsonb_typeof(pb.calculated_data::jsonb -> 'rank') = ${sql.lit("number")}`,
		)
		.where(cmp)
		.orderBy(rankExpr, order)
		.limit(limit);

	const rows = await q.execute();

	return Promise.all(rows.map((r) => ToPbScoreDocument(r as PbDocumentJoinRow)));
}
