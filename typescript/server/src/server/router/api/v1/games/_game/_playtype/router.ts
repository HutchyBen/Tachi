import { CreateActivityRouteHandler } from "#lib/activity/activity";
import { ONE_HOUR } from "#lib/constants/time";
import { SELECT_GAME_PROFILE, ToGameStatsDocument } from "#lib/db-formats/game-profiles.js";
import { LoadPbDocumentsForGameSortedByCalculatedAlg } from "#lib/db-formats/pb";
import { SELECT_USER, ToUserDocument } from "#lib/db-formats/user.js";
import prValidate from "#server/middleware/prudence-validate";
import DB from "#services/pg/db.js";
import { GetRelevantSongsAndCharts } from "#utils/db";
import { EscapeForILIKE, IsString } from "#utils/misc";
import { GetGPT } from "#utils/req-tachi-data";
import {
	CheckStrProfileAlg,
	CheckStrScoreAlg,
	ParseStrPositiveNonZeroInt,
} from "#utils/string-checks";
import { GetUsersWithIDs } from "#utils/user";
import { Router } from "express";
import { sql } from "kysely";
import NodeCache from "node-cache";
import {
	FormatGameGroup,
	type GameGroup,
	GamePTToV3,
	GetGamePTConfig,
	type integer,
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
		const v3Game = GamePTToV3(game, playtype);

		const [scoreCount, playerCount, chartCount] = await Promise.all([
			DB.selectFrom("score")
				.select((eb) => eb.fn.countAll().as("c"))
				.where("score.game", "=", v3Game)
				.executeTakeFirst()
				.then((r) => Number(r?.c ?? 0)),
			DB.selectFrom("game_profile")
				.select((eb) => eb.fn.countAll().as("c"))
				.where("game_profile.game", "=", v3Game)
				.executeTakeFirst()
				.then((r) => Number(r?.c ?? 0)),
			DB.selectFrom("chart")
				.select((eb) => eb.fn.countAll().as("c"))
				.where("chart.game", "=", v3Game)
				.executeTakeFirst()
				.then((r) => Number(r?.c ?? 0)),
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

	const v3Game = GamePTToV3(game, playtype);
	const ratingCol = sql<number>`coalesce((game_profile.ratings::jsonb->>${sql.lit(alg)})::numeric, 0)`;

	const gameStats = await DB.selectFrom("game_profile")
		.select(SELECT_GAME_PROFILE)
		.where("game_profile.game", "=", v3Game)
		.orderBy(ratingCol, "desc")
		.limit(limit)
		.execute()
		.then((rows) => rows.map(ToGameStatsDocument));

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

	const v3Game = GamePTToV3(game, playtype);
	const pbs = await LoadPbDocumentsForGameSortedByCalculatedAlg(v3Game, alg, limit);

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
		const v3Game = GamePTToV3(game, playtype);

		const { search } = req.query as {
			search: string;
		};

		const gptPlayers = await DB.selectFrom("account")
			.innerJoin("game_profile", "game_profile.user_id", "account.id")
			.select(SELECT_USER)
			.where("game_profile.game", "=", v3Game)
			.where("account.username", "ilike", `%${EscapeForILIKE(search)}%`)
			.execute()
			.then((res) => res.map(ToUserDocument));

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
