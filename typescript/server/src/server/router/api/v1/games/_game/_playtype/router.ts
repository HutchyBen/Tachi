import type { FindOptions } from "monk";

import { CreateActivityRouteHandler } from "#lib/activity/activity";
import { ONE_HOUR } from "#lib/constants/time";
import { SearchUsersRegExp } from "#lib/search/search";
import prValidate from "#server/middleware/prudence-validate";
import MONGODB_KILL from "#services/mongo/db";
import { GetRelevantSongsAndCharts } from "#utils/db";
import { IsString } from "#utils/misc";
import { GetGPT } from "#utils/req-tachi-data";
import {
	CheckStrProfileAlg,
	CheckStrScoreAlg,
	ParseStrPositiveNonZeroInt,
} from "#utils/string-checks";
import { GetUsersWithIDs } from "#utils/user";
import { Router } from "express";
import NodeCache from "node-cache";
import {
	FormatGameGroup,
	type GameGroup,
	GetGamePTConfig,
	type integer,
	type MONGO_UserGameStats,
	type Playtype,
} from "tachi-common";

import chartsRouter from "./charts/router";
import foldersRouter from "./folders/router";
import { ValidatePlaytypeFromParam } from "./middleware";
import songIDRouter from "./songs/_songID/router";
import tablesRouter from "./tables/router";
import targetsRouter from "./targets/router";

const router: Router = Router({ mergeParams: true });

router.use(ValidatePlaytypeFromParam);

const gptStatCache = new NodeCache();

async function GetGameStats(
	game: GameGroup,
	playtype: Playtype,
): Promise<{ chartCount: integer; playerCount: integer; scoreCount: integer }> {
	const cacheRes = gptStatCache.get(`${game}:${playtype}`);

	if (cacheRes === undefined) {
		const [scoreCount, playerCount, chartCount] = await Promise.all([
			MONGODB_KILL.scores.count({
				game,
				playtype,
			}),
			MONGODB_KILL["game-stats"].count({
				game,
				playtype,
			}),
			MONGODB_KILL.anyCharts[game].count({ playtype }),
		]);

		gptStatCache.set(`${game}:${playtype}`, { scoreCount, playerCount, chartCount }, ONE_HOUR);

		return { scoreCount, playerCount, chartCount };
	}

	return cacheRes as { chartCount: integer; playerCount: integer; scoreCount: integer };
}

/**
 * Returns the configuration for this game along with some statistics.
 *
 * @name GET /api/v1/games/:game/:playtype
 */
router.get("/", async (req, res) => {
	const { game, playtype } = GetGPT(req);

	const { scoreCount, playerCount, chartCount } = await GetGameStats(game, playtype);

	return res.status(200).json({
		success: true,
		description: `Retrieved information about ${FormatGameGroup(game, playtype)}`,
		body: {
			config: GetGamePTConfig(game, playtype),
			scoreCount,
			playerCount,
			chartCount,
		},
	});
});

/**
 * Returns user-game-stats for this game in batches of 500.
 * This is sorted by the games default-sorting-statistic.
 *
 * @param alg - An alternative algorithm to use instead of the gpts default.
 * @param limit - How many users to return at most. Defaults (and is limited to) 500.
 *
 * @name GET /api/v1/games/:game/:playtype/leaderboard
 */
router.get("/leaderboard", async (req, res) => {
	const { game, playtype } = GetGPT(req);
	const gptConfig = GetGamePTConfig(game, playtype);

	const limit = ParseStrPositiveNonZeroInt(req.query.limit) ?? 100;

	if (limit > 500) {
		return res.status(400).json({
			success: false,
			description: `Invalid limit. Limit is capped at 500.`,
		});
	}

	let alg = gptConfig.defaultProfileRatingAlg;

	if (IsString(req.query.alg)) {
		const temp = CheckStrProfileAlg(game, playtype, req.query.alg);

		if (temp === null) {
			return res.status(400).json({
				success: false,
				description: `Invalid value of ${
					req.query.alg
				} for alg. Expected one of ${Object.keys(gptConfig.profileRatingAlgs).join(", ")}`,
			});
		}

		alg = temp;
	}

	const options: FindOptions<MONGO_UserGameStats> = {
		sort: {
			[`ratings.${alg}`]: -1,
		},
		limit,
	};

	const gameStats = await MONGODB_KILL["game-stats"].find(
		{
			game,
			playtype,
		},
		options,
	);

	const users = await GetUsersWithIDs(gameStats.map((e) => e.userID));

	return res.status(200).json({
		success: true,
		description: `Returned ${gameStats.length} user's game stats.`,
		body: {
			gameStats,
			users,
		},
	});
});

/**
 * Returns the best scores for this game.
 *
 * @param alg - An alternative algorithm to use instead of the gpts default.
 * @param limit - How many scores to return.
 *
 * @name GET /api/v1/games/:game/:playtype/pb-leaderboard
 */
router.get("/pb-leaderboard", async (req, res) => {
	const { game, playtype } = GetGPT(req);
	const gptConfig = GetGamePTConfig(game, playtype);

	const limit = ParseStrPositiveNonZeroInt(req.query.limit) ?? 50;

	if (limit > 50) {
		return res.status(400).json({
			success: false,
			description: `Cannot specify a limit higher than 50.`,
		});
	}

	let alg = gptConfig.defaultScoreRatingAlg;

	if (IsString(req.query.alg)) {
		const temp = CheckStrScoreAlg(game, playtype, req.query.alg);

		if (temp === null) {
			return res.status(400).json({
				success: false,
				description: `Invalid value of ${
					req.query.alg
				} for alg. Expected one of ${Object.keys(gptConfig.profileRatingAlgs).join(", ")}`,
			});
		}

		alg = temp;
	}

	const pbs = await MONGODB_KILL["personal-bests"].find(
		{
			game,
			playtype,
		},
		{
			sort: {
				[`calculatedData.${alg}`]: -1,
			},
			limit,
		},
	);

	const users = await GetUsersWithIDs(pbs.map((e) => e.userID));

	const { songs, charts } = await GetRelevantSongsAndCharts(pbs, game);

	return res.status(200).send({
		success: true,
		description: `Successfully returned ${pbs.length} pbs.`,
		body: {
			pbs,
			songs,
			charts,
			users,
		},
	});
});

/**
 * Search users that have played this game.
 *
 * @param search - The username to search for.
 *
 * @name GET /api/v1/games/:game/:playtype/players
 */
router.get(
	"/players",
	prValidate({
		search: "string",
	}),
	async (req, res) => {
		const { game, playtype } = GetGPT(req);

		const { search } = req.query as {
			search: string;
		};

		const users = await SearchUsersRegExp(search);

		const gameStats = await MONGODB_KILL["game-stats"].find({
			userID: { $in: users.map((e) => e.id) },
			game,
			playtype,
		});

		const thoseWithStats = gameStats.map((e) => e.userID);

		const gptPlayers = users.filter((e) => thoseWithStats.includes(e.id));

		return res.status(200).json({
			success: true,
			description: `Found ${gptPlayers.length} user(s)`,
			body: gptPlayers,
		});
	},
);

/**
 * Retrieve activity for this GPT.
 *
 * @name GET /api/v1/games/:game/:playtype/activity
 */
router.get("/activity", (req, res) => {
	const { game, playtype } = GetGPT(req);

	const route = CreateActivityRouteHandler({
		game,
		playtype,
	});

	// this handles responding
	void route(req, res);
});

router.use("/charts", chartsRouter);
router.use("/songs/:songID", songIDRouter);
router.use("/folders", foldersRouter);
router.use("/tables", tablesRouter);
router.use("/targets", targetsRouter);

export default router;
