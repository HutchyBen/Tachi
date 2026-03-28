import { ACTION_RebuildFolderChartLookup } from "#actions/rebuild-folder-chart-lookup.js";
import { SYMBOL_TACHI_API_AUTH } from "#lib/constants/tachi";
import { log } from "#lib/log/log";
import { SendSiteAnnouncementNotification } from "#lib/notifications/notification-wrappers";
import { UpdateGoalsForUser } from "#lib/score-import/framework/goals/goals";
import { UpdateQuestsForUser } from "#lib/score-import/framework/quests/quests";
import { DeleteMultipleScores, DeleteScore } from "#lib/score-mutation/delete-scores";
import { TachiConfig } from "#lib/setup/config";
import prValidate from "#server/middleware/prudence-validate";
import MONGODB_KILL from "#services/mongo/db";
import { RecalcAllScores, UpdateAllPBs } from "#utils/calculations/recalc-scores";
import { RecalcSessions } from "#utils/calculations/recalc-sessions";
import { IsValidPlaytype } from "#utils/misc";
import DestroyUserGamePlaytypeData from "#utils/reset-state/destroy-ugpt";
import { GetScoresFromSession } from "#utils/session";
import { GetUserWithID, GetUserWithIDGuaranteed, ResolveUser } from "#utils/user";
import { type RequestHandler, Router } from "express";
import { p } from "prudence";
import {
	type GameGroup,
	type integer,
	type MONGO_GoalSubscriptionDocument,
	type Playtype,
	UserAuthLevels,
} from "tachi-common";

const router: Router = Router({ mergeParams: true });

const RequireAdminLevel: RequestHandler = async (req, res, next) => {
	if (req[SYMBOL_TACHI_API_AUTH].userID === null) {
		return res.status(401).json({
			success: false,
			description: `You are not authenticated.`,
		});
	}

	const userDoc = await GetUserWithID(req[SYMBOL_TACHI_API_AUTH].userID);

	if (!userDoc) {
		log.error(
			`Api Token ${req[SYMBOL_TACHI_API_AUTH].token} is assigned to ${req[SYMBOL_TACHI_API_AUTH].userID}, who does not exist?`,
		);

		return res.status(500).json({
			success: false,
			description: `An internal error has occured.`,
		});
	}

	if (userDoc.authLevel !== UserAuthLevels.ADMIN) {
		return res.status(403).json({
			success: false,
			description: `You are not authorised to perform this.`,
		});
	}

	next();
};

router.use(RequireAdminLevel);

/**
 * Resynchronises all PBs that match the given query or users.
 *
 * @param userIDs - Optionally, An array of integers of users to resync.
 * @param filter - Optionally, the set of scores to resync.
 *
 * @name POST /api/v1/admin/resync-pbs
 */
router.post(
	"/resync-pbs",
	prValidate({
		userIDs: p.optional([p.isPositiveInteger]),
		filter: "*object",
	}),
	async (req, res) => {
		const body = req.safeBody as {
			filter?: object;
			userIDs?: Array<integer>;
		};

		await UpdateAllPBs(body.userIDs, body.filter);

		return res.status(200).json({
			success: true,
			description: `Done.`,
			body: {},
		});
	},
);

/**
 * Force Delete anyones score.
 *
 * @param scoreID - The scoreID to delete.
 *
 * @name POST /api/v1/admin/delete-score
 */
router.post("/delete-score", prValidate({ scoreID: "string" }), async (req, res) => {
	const body = req.safeBody as { scoreID: string };

	const score = await MONGODB_KILL.scores.findOne({ scoreID: body.scoreID });

	if (!score) {
		return res.status(404).json({
			success: false,
			description: `This score does not exist.`,
		});
	}

	await DeleteScore(score);

	return res.status(200).json({
		success: true,
		description: `Removed score.`,
		body: {},
	});
});

/**
 * Force Delete anyones session.
 *
 * @param sessionID - The sessionID to delete.
 *
 * @name POST /api/v1/admin/delete-session
 */
router.post("/delete-session", prValidate({ sessionID: "string" }), async (req, res) => {
	const body = req.safeBody as { sessionID: string };

	const session = await MONGODB_KILL.sessions.findOne({ scoreID: body.sessionID });

	if (!session) {
		return res.status(404).json({
			success: false,
			description: `This session does not exist.`,
		});
	}

	const scores = await GetScoresFromSession(session);

	await DeleteMultipleScores(scores);

	return res.status(200).json({
		success: true,
		description: `Removed session.`,
		body: {},
	});
});

/**
 * Destroys a users UGPT profile and forces a leaderboard recalc.
 *
 * @param userID - The U...
 * @param game - The G...
 * @param playtype - And the PT to delete.
 *
 * @name POST /api/v1/admin/destroy-ugpt
 */
router.post(
	"/destroy-ugpt",
	prValidate({
		userID: p.isInteger,
		game: p.isIn(TachiConfig.GAMES),
		playtype: (self, parent) => {
			if (typeof self !== "string") {
				return "Expected a string for a playtype.";
			}

			if (!IsValidPlaytype(parent.game as GameGroup, self)) {
				return `Invalid playtype of ${self} for game ${parent.game as GameGroup}.`;
			}

			return true;
		},
	}),
	async (req, res) => {
		const { userID, game, playtype } = req.safeBody as {
			game: GameGroup;
			playtype: Playtype;
			userID: integer;
		};

		const ugpt = await MONGODB_KILL["game-stats"].findOne({
			userID,
			game,
			playtype,
		});

		if (!ugpt) {
			return res.status(404).json({
				success: false,
				description: `No stats for ${userID} (${game} ${playtype}) exist.`,
			});
		}

		await DestroyUserGamePlaytypeData(userID, game, playtype);

		return res.status(200).json({
			success: true,
			description: `Completely destroyed UGPT for ${userID} (${game} ${playtype}).`,
			body: {},
		});
	},
);

/**
 * Destroy a chart and all of its scores (and sessions).
 *
 * @param chartID - The chartID to delete.
 * @param game - The game this chart is for. Necessary for doing lookups.
 *
 * @name POST /api/v1/admin/destroy-chart
 */
router.post(
	"/destroy-chart",
	prValidate({ chartID: "string", game: p.isIn(TachiConfig.GAMES) }),
	async (req, res) => {
		const body = req.safeBody as {
			chartID: string;
			game: GameGroup;
		};

		const { game, chartID } = body;

		const scores = await MONGODB_KILL.scores.find({
			chartID,
		});

		await DeleteMultipleScores(scores);

		await MONGODB_KILL.anyCharts[game].remove({
			chartID,
		});

		await MONGODB_KILL["personal-bests"].remove({
			chartID,
		});

		return res.status(200).json({
			success: true,
			description: `Obliterated chart.`,
			body: {},
		});
	},
);

/**
 * Perform a site recalc on this set of scores.
 *
 * @name POST /api/v1/admin/recalc
 */
router.post("/recalc", async (req, res) => {
	const filter = req.safeBody;

	await RecalcAllScores(filter);

	const scoreIDs = (
		await MONGODB_KILL.scores.find(filter, {
			projection: {
				scoreID: 1,
			},
		})
	).map((e) => e.scoreID);

	await RecalcSessions({
		scoreIDs: { $in: scoreIDs },
	});

	return res.status(200).json({
		success: true,
		description: `Recalced scores.`,
		body: {
			scoresRecalced: scoreIDs.length,
		},
	});
});

/**
 * Send an announcement to the site.
 *
 * @name POST /api/v1/admin/announcement
 */
router.post(
	"/announcement",
	prValidate({
		game: p.optional(p.isIn(TachiConfig.GAMES)),
		playtype: "*string",
		title: "string",
	}),
	async (req, res) => {
		const { game, playtype, title } = req.safeBody as {
			game?: GameGroup;
			playtype?: string;
			title: string;
		};

		let maybePlaytype: Playtype | undefined;

		if (game && playtype) {
			if (!IsValidPlaytype(game, playtype)) {
				return res.status(400).json({
					success: false,
					description: `Invalid playtype '${playtype}' for game '${game}'.`,
				});
			}

			maybePlaytype = playtype;
		}

		await SendSiteAnnouncementNotification(title, game, maybePlaytype);

		return res.status(200).json({
			success: true,
			description: `Sent notification '${title}'.`,
			body: {},
		});
	},
);

/**
 * Make this user a Tachi supporter.
 *
 * @name POST /api/v1/admin/supporter/:userID
 */
router.post("/supporter/:userID", async (req, res) => {
	const user = await ResolveUser(req.params.userID);

	if (!user) {
		return res.status(404).json({
			success: false,
			description: `This user does not exist.`,
		});
	}

	await MONGODB_KILL.users.update({ id: user.id }, { $set: { isSupporter: true } });

	return res.status(200).json({
		success: true,
		description: `Done.`,
		body: {},
	});
});

/**
 * Un-Make this user a Tachi supporter.
 *
 * @name POST /api/v1/admin/supporter/:userID
 */
router.delete("/supporter/:userID", async (req, res) => {
	const user = await ResolveUser(req.params.userID);

	if (!user) {
		return res.status(404).json({
			success: false,
			description: `This user does not exist.`,
		});
	}

	await MONGODB_KILL.users.update({ id: user.id }, { $set: { isSupporter: false } });

	return res.status(200).json({
		success: true,
		description: `Done.`,
		body: {},
	});
});

/**
 * Rebuilds the Postgres `folder_chart_lookup` table (chart → folders cache).
 *
 * @param folderId - If set, only rebuild that folder's rows.
 *
 * @name POST /api/v1/admin/rebuild-folder-chart-lookup
 */
router.post(
	"/rebuild-folder-chart-lookup",
	prValidate({
		folderId: p.optional("string"),
	}),
	async (req, res) => {
		const userID = req[SYMBOL_TACHI_API_AUTH].userID;

		if (userID === null) {
			return res.status(401).json({
				success: false,
				description: `You are not authenticated.`,
			});
		}

		const user = await GetUserWithIDGuaranteed(userID);
		const body = req.safeBody as { folderId?: string };
		const taker = { ip: req.ip, acct: { id: user.id, username: user.username } };

		const result = await ACTION_RebuildFolderChartLookup(taker, {
			folderId: body.folderId,
		});

		return res.status(200).json({
			success: true,
			description: `Rebuilt folder_chart_lookup (${result.folderCount} folders, ${result.rowCount} rows).`,
			body: result,
		});
	},
);

/**
 * Reprocess all goals for every user. This should be used to un-screw the site
 * if the server goes down or peoples goals fall out of sync. Obviously, this
 * should never happen, but the error handling around this stuff is really wacky.
 *
 * @name POST /api/v1/admin/reprocess-all-goals
 */
router.post("/reprocess-all-goals", async (req, res) => {
	const ugpts = await MONGODB_KILL["game-stats"].find({});

	const promises = [];

	for (const ugpt of ugpts) {
		promises.push(async () => {
			const goalSubs = await MONGODB_KILL["goal-subs"].find({
				game: ugpt.game,
				playtype: ugpt.playtype,
				userID: ugpt.userID,
			});

			const goalSubsMap = new Map<string, MONGO_GoalSubscriptionDocument>();

			for (const gSub of goalSubs) {
				goalSubsMap.set(gSub.goalID, gSub);
			}

			const goals = await MONGODB_KILL.goals.find({
				goalID: { $in: goalSubs.map((e) => e.goalID) },
			});

			await UpdateGoalsForUser(goals, goalSubsMap, ugpt.userID, log);

			const allQuestSubs = await MONGODB_KILL["quest-subs"].find({
				game: ugpt.game,
				playtype: ugpt.playtype,
				userID: ugpt.userID,
			});

			const quests = await MONGODB_KILL.quests.find({
				questID: { $in: allQuestSubs.map((e) => e.questID) },
			});

			await UpdateQuestsForUser(quests, allQuestSubs, ugpt.game, ugpt.userID, log);
		});
	}

	await Promise.all(promises);

	return res.status(200).json({
		success: true,
		description: "Reprocessed all goals.",
		body: {},
	});
});

export default router;
