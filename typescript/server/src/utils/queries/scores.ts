import type { Game } from "tachi-db";

import {
	type ScoreDocumentJoinRow,
	SELECT_SCORE_DOCUMENT,
	ToScoreDocument,
} from "#lib/db-formats/score";
import DB from "#services/pg/db";
import { sql } from "kysely";
import { type GameGroup, GamePTToV3, type integer, type Playtype } from "tachi-common";

/** Shared score + chart + song + import select used by activity and UGPT score queries. */
export function scoreDocumentJoin() {
	return DB.selectFrom("score")
		.innerJoin("chart", "chart.id", "score.chart_id")
		.innerJoin("song", "song.id", "chart.song_id")
		.leftJoin("import", "import.id", "score.import_id")
		.select(SELECT_SCORE_DOCUMENT);
}

export async function GetRecentUGPTScores(
	userID: integer,
	game: GameGroup,
	playtype: Playtype,
	limit = 100,
) {
	const v3Game = GamePTToV3(game, playtype) as Game;

	const rows = await scoreDocumentJoin()
		.where("score.user_id", "=", userID)
		.where("score.game", "=", v3Game)
		.orderBy("score.time_added", "desc")
		.limit(limit)
		.execute();

	return rows.map((row) => ToScoreDocument(row as ScoreDocumentJoinRow));
}

/**
 * Recent scores for a user/game/playtype, ordered by play time (`time_achieved`) descending
 * (Mongo `timeAchieved: -1` parity). Null play times sort last.
 */
export async function GetRecentUGPTScoresByTimeAchieved(
	userID: integer,
	game: GameGroup,
	playtype: Playtype,
	limit = 100,
) {
	const v3Game = GamePTToV3(game, playtype) as Game;

	const rows = await scoreDocumentJoin()
		.where("score.user_id", "=", userID)
		.where("score.game", "=", v3Game)
		.orderBy(sql`score.time_achieved desc nulls last`)
		.limit(limit)
		.execute();

	return rows.map((row) => ToScoreDocument(row as ScoreDocumentJoinRow));
}

/** Scores for a user on the given Postgres chart ids, ordered by `time_achieved` desc (nulls last). */
export async function GetScoresForUserOnChartPgIds(
	userID: integer,
	v3Game: Game,
	chartPgIds: string[],
	limit: number,
) {
	if (chartPgIds.length === 0) {
		return [];
	}

	const rows = await scoreDocumentJoin()
		.where("score.user_id", "=", userID)
		.where("score.game", "=", v3Game)
		.where("chart.id", "in", chartPgIds)
		.orderBy(sql`score.time_achieved desc nulls last`)
		.limit(limit)
		.execute();

	return rows.map((row) => ToScoreDocument(row as ScoreDocumentJoinRow));
}

/** All scores for a user on primary charts only (`chart.is_primary`), unordered (Mongo `/scores/all` parity). */
export async function GetPrimaryScoresForUserUGPT(
	userID: integer,
	game: GameGroup,
	playtype: Playtype,
) {
	const v3Game = GamePTToV3(game, playtype) as Game;

	const rows = await scoreDocumentJoin()
		.where("score.user_id", "=", userID)
		.where("score.game", "=", v3Game)
		.where("chart.is_primary", "=", true)
		.execute();

	return rows.map((row) => ToScoreDocument(row as ScoreDocumentJoinRow));
}

export async function GetRecentUGPTHighlights(
	userID: integer,
	game: GameGroup,
	playtype: Playtype,
	limit = 100,
) {
	const v3Game = GamePTToV3(game, playtype) as Game;

	const rows = await scoreDocumentJoin()
		.where("score.user_id", "=", userID)
		.where("score.game", "=", v3Game)
		.where("score.highlight", "=", true)
		.orderBy("score.time_added", "desc")
		.limit(limit)
		.execute();

	return rows.map((row) => ToScoreDocument(row as ScoreDocumentJoinRow));
}
