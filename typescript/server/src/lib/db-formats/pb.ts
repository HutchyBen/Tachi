import type { Game } from "tachi-db";

import { pgScoreDataToMongo } from "#lib/v3/migration-tools";
import DB from "#services/pg/db";
import { ISO8601ToUnixMilliseconds } from "#utils/time";
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

	const scoreData = pgScoreDataToMongo(row.chart_game as V3Game, {
		data: row.data,
		derived: row.derived_data,
		judgements: {},
	} as Parameters<typeof pgScoreDataToMongo>[1]);

	return {
		composedFrom,
		rankingData: { outOf: 0, rank: 0, rivalRank: null },
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
