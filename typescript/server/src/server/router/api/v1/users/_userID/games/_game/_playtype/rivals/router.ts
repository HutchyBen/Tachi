import { ACTION_SetRivals } from "#actions/set-rivals";
import { CreateActivityRouteHandler } from "#lib/activity/activity";
import { SYMBOL_TACHI_API_AUTH } from "#lib/constants/tachi";
import { LoadPbDocumentsForUserSetSortedByCalculatedAlg } from "#lib/db-formats/pb";
import { GetChallengerUsers, GetRivalIDs, GetRivalUsers } from "#lib/rivals/rivals";
import { RequirePermissions } from "#server/middleware/auth";
import prValidate from "#server/middleware/prudence-validate";
import { GetRelevantSongsAndCharts } from "#utils/db";
import { IsString } from "#utils/misc";
import { GetUGPT } from "#utils/req-tachi-data";
import { CheckStrScoreAlg } from "#utils/string-checks";
import { GetUsersWithIDs, GetUserWithIDGuaranteed } from "#utils/user";
import { Router } from "express";
import { p } from "prudence";
import { GamePTToV3, GetGamePTConfig, type integer } from "tachi-common";

import { RequireAuthedAsUser } from "../../../../middleware";

const router: Router = Router({ mergeParams: true });

/**
 * Returns all of this user's set rivals.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/rivals
 */
router.get("/", async (req, res) => {
	const { user, game, playtype } = GetUGPT(req);

	const rivals = await GetRivalUsers(user.id, game, playtype);

	return res.status(200).json({
		success: true,
		description: `Returned ${rivals.length} rivals.`,
		body: rivals,
	});
});

/**
 * Sets the user's rivals for this GPT.
 *
 * @param rivalIDs - An array of rivalIDs to set as their rivals.
 *
 * @name PUT /api/v1/users/:userID/games/:game/:playtype/rivals
 */
router.put(
	"/",
	RequireAuthedAsUser,
	RequirePermissions("manage_rivals"),
	prValidate({
		rivalIDs: [p.isPositiveNonZeroInteger],
	}),
	async (req, res) => {
		const body = req.safeBody as {
			rivalIDs: Array<integer>;
		};

		const rivalIDs = body.rivalIDs;
		const { user, game, playtype } = GetUGPT(req);

		const authUserID = req[SYMBOL_TACHI_API_AUTH].userID;

		if (authUserID === null) {
			return res.status(401).json({
				success: false,
				description: `Authentication is required for this endpoint.`,
			});
		}

		const authedUser = await GetUserWithIDGuaranteed(authUserID);
		const taker = { ip: req.ip, acct: { id: authedUser.id, username: authedUser.username } };

		await ACTION_SetRivals(taker, {
			userID: user.id,
			game,
			playtype,
			rivalIDs,
		});

		return res.status(200).json({
			success: true,
			description: `Set ${rivalIDs.length} rivals.`,
			body: {},
		});
	},
);

/**
 * Return all of the users that are rivalling this user for this GPT.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/rivals/challengers
 */
router.get("/challengers", async (req, res) => {
	const { user, game, playtype } = GetUGPT(req);

	const challengers = await GetChallengerUsers(user.id, game, playtype);

	return res.status(200).json({
		success: true,
		description: `Returned ${challengers.length} challengers.`,
		body: challengers,
	});
});

/**
 * Retrieve a "PB leaderboard" for this user's set of rivals.
 *
 * This is - effectively - the best 100 scores from this set of users on the given
 * rating algorithm.
 *
 * @param alg - The score rating algorithm to sort on. Defaults to whatever the GPTConfig
 * default is.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/rivals/pb-leaderboard
 */
router.get("/pb-leaderboard", async (req, res) => {
	const { user, game, playtype } = GetUGPT(req);
	const gptConfig = GetGamePTConfig(game, playtype);

	let alg = gptConfig.defaultScoreRatingAlg;

	if (IsString(req.query.alg)) {
		const temp = CheckStrScoreAlg(game, playtype, req.query.alg);

		if (temp === null) {
			return res.status(400).json({
				success: false,
				description: `Invalid value of ${
					req.query.alg
				} for alg. Expected one of ${Object.keys(gptConfig.scoreRatingAlgs).join(", ")}`,
			});
		}

		alg = temp;
	}

	const rivalIDs = await GetRivalIDs(user.id, game, playtype);
	const userSet = [...rivalIDs, user.id];

	const v3Game = GamePTToV3(game, playtype);
	const pbs = await LoadPbDocumentsForUserSetSortedByCalculatedAlg(userSet, v3Game, alg, 100);

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
 * Retrieve activity for this user's set of rivals.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/rivals/activity
 */
router.get("/activity", async (req, res) => {
	const { game, playtype, user } = GetUGPT(req);

	const rivalIDs = await GetRivalIDs(user.id, game, playtype);

	const route = CreateActivityRouteHandler({
		userID: { $in: rivalIDs },
		game,
		playtype,
	});

	// this handles responding
	void route(req, res);
});

export default router;
