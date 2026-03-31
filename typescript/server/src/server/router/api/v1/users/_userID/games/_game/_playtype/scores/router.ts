import { GetChartById } from "#lib/db-formats/chart.js";
import {
	type ScoreDocumentJoinRow,
	SELECT_SCORE_DOCUMENT,
	ToScoreDocument,
} from "#lib/db-formats/score";
import { SearchSpecificGameSongsAndCharts } from "#lib/search/song-charts.js";
import { HyperAggressiveRateLimitMiddleware } from "#server/middleware/rate-limiter";
import DB from "#services/pg/db";
import { GetRelevantSongsAndCharts } from "#utils/db";
import {
	GetPrimaryScoresForUserUGPT,
	GetRecentUGPTScoresByTimeAchieved,
	GetScoresForUserOnChartPgIds,
} from "#utils/queries/scores";
import { GetUGPT } from "#utils/req-tachi-data";
import { FilterChartsAndSongs } from "#utils/scores";
import { Router } from "express";
import { GamePTToV3 } from "tachi-common";

const router: Router = Router({ mergeParams: true });

/**
 * Searches a user's individual scores.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/scores
 */
router.get("/", async (req, res) => {
	const { user, game, playtype } = GetUGPT(req);

	if (typeof req.query.search !== "string") {
		return res.status(400).json({
			success: false,
			description: `Invalid value for search parameter.`,
		});
	}

	const { songs: allSongs, charts: allCharts } = await SearchSpecificGameSongsAndCharts(
		game,
		req.query.search,
		playtype,
	);

	const v3Game = GamePTToV3(game, playtype);
	const chartPgIds = [...new Set(allCharts.map((c) => c.chartID))];
	const scores = await GetScoresForUserOnChartPgIds(user.id, v3Game, chartPgIds, 30);

	const { songs, charts } = FilterChartsAndSongs(scores, allCharts, allSongs);

	return res.status(200).json({
		success: true,
		description: `Retrieved ${scores.length} scores.`,
		body: {
			scores,
			songs,
			charts,
		},
	});
});

/**
 * Retrieve all scores from this user.
 *
 * @warn This endpoint is expensive, and is rate-limited as such.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/scores/all
 */
router.get("/all", HyperAggressiveRateLimitMiddleware, async (req, res) => {
	const { user, game, playtype } = GetUGPT(req);

	const scores = await GetPrimaryScoresForUserUGPT(user.id, game, playtype);

	const { songs, charts } = await GetRelevantSongsAndCharts(scores, game);

	return res.status(200).json({
		success: true,
		description: `Returned ${scores.length} PBs.`,
		body: { scores, songs, charts },
	});
});

/**
 * Returns a users recent 100 scores for this game.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/scores/recent
 */
router.get("/recent", async (req, res) => {
	const { user, game, playtype } = GetUGPT(req);

	const recentScores = await GetRecentUGPTScoresByTimeAchieved(user.id, game, playtype, 100);

	const { songs, charts } = await GetRelevantSongsAndCharts(recentScores, game);

	return res.status(200).json({
		success: true,
		description: `Retrieved ${recentScores.length} scores.`,
		body: {
			scores: recentScores,
			songs,
			charts,
		},
	});
});

/**
 * Retrieve all the scores a user has on the given chartID.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/scores/:chartID
 */
router.get("/:chartID", async (req, res) => {
	const { user, game, playtype } = GetUGPT(req);

	const chart = await GetChartById(GamePTToV3(game, playtype), req.params.chartID);

	if (!chart) {
		return res.status(404).json({
			success: false,
			description: `This chart does not exist.`,
		});
	}

	const rows = await DB.selectFrom("score")
		.innerJoin("chart", "chart.id", "score.chart_id")
		.innerJoin("song", "song.id", "chart.song_id")
		.leftJoin("import", "import.id", "score.import_id")
		.select(SELECT_SCORE_DOCUMENT)
		.where("score.user_id", "=", user.id)
		.where("chart.id", "=", chart.chartID)
		.orderBy("score.time_added", "desc")
		.execute();

	return res.status(200).json({
		success: true,
		description: `Returned ${rows.length} scores.`,
		body: rows.map((r) => ToScoreDocument(r as ScoreDocumentJoinRow)),
	});
});

export default router;
