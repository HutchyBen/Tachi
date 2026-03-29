import type { Game } from "tachi-db";

import {
	type ScoreDocumentJoinRow,
	SELECT_SCORE_DOCUMENT,
	ToScoreDocument,
} from "#lib/db-formats/score";
import DB from "#services/pg/db";
import { type GameGroup, GamePTToV3, type integer, type Playtype } from "tachi-common";

export async function GetRecentUGPTScores(
	userID: integer,
	game: GameGroup,
	playtype: Playtype,
	limit = 100,
) {
	const v3Game = GamePTToV3(game, playtype) as Game;

	const rows = await DB.selectFrom("score")
		.innerJoin("chart", "chart.id", "score.chart_id")
		.innerJoin("song", "song.id", "chart.song_id")
		.leftJoin("import", "import.id", "score.import_id")
		.select(SELECT_SCORE_DOCUMENT)
		.where("score.user_id", "=", userID)
		.where("score.game", "=", v3Game)
		.orderBy("score.time_added", "desc")
		.limit(limit)
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

	const rows = await DB.selectFrom("score")
		.innerJoin("chart", "chart.id", "score.chart_id")
		.innerJoin("song", "song.id", "chart.song_id")
		.leftJoin("import", "import.id", "score.import_id")
		.select(SELECT_SCORE_DOCUMENT)
		.where("score.user_id", "=", userID)
		.where("score.game", "=", v3Game)
		.where("score.highlight", "=", true)
		.orderBy("score.time_added", "desc")
		.limit(limit)
		.execute();

	return rows.map((row) => ToScoreDocument(row as ScoreDocumentJoinRow));
}
