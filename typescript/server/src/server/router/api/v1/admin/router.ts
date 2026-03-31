import { ACTION_DeleteScore } from "#actions/delete-score.js";
import { ACTION_DeleteSession } from "#actions/delete-session.js";
import { ACTION_RebuildFolderChartLookup } from "#actions/rebuild-folder-chart-lookup.js";
import { ACTION_SetUserSupporterStatus } from "#actions/set-user-supporter-status.js";
import {
	GetActions,
	GetActiveJobs,
	GetCronTaskExecutions,
	GetCronTasks,
	GetJobQueue,
} from "#lib/admin/admin-queries.js";
import { SYMBOL_TACHI_API_AUTH } from "#lib/constants/tachi";
import { log } from "#lib/log/log";
import { SendSiteAnnouncementNotification } from "#lib/notifications/notification-wrappers";
import { TachiConfig } from "#lib/setup/config";
import prValidate from "#server/middleware/prudence-validate";
import DB from "#services/pg/db.js";
import { IsValidPlaytype } from "#utils/misc";
import DestroyUserGameProfile from "#utils/reset-state/destroy-user-game-profile.js";
import { GetUserWithID, GetUserWithIDGuaranteed, ResolveUser } from "#utils/user";
import { type RequestHandler, Router } from "express";
import { p } from "prudence";
import {
	type GameGroup,
	GamePTToV3,
	type integer,
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
 * @name GET /api/v1/admin/job-queue
 */
router.get("/job-queue", async (req, res) => {
	const page = Math.max(0, Number(req.query.page ?? 0));
	const statusRaw = req.query.status;
	let status: number | undefined;
	if (typeof statusRaw === "string" && statusRaw !== "") {
		const n = Number.parseInt(statusRaw, 10);
		if (!Number.isNaN(n)) {
			status = n;
		}
	}
	const job_kind =
		typeof req.query.job_kind === "string" && req.query.job_kind !== ""
			? req.query.job_kind
			: undefined;
	const scope =
		typeof req.query.scope === "string" && req.query.scope !== "" ? req.query.scope : undefined;

	const [activeJobs, jobQueue] = await Promise.all([
		GetActiveJobs(),
		GetJobQueue({ page, status, job_kind, scope }),
	]);

	return res.status(200).json({
		success: true,
		description: "Done.",
		body: { activeJobs, jobQueue, filters: { status, job_kind, scope } },
	});
});

/**
 * @name GET /api/v1/admin/actions
 */
router.get("/actions", async (req, res) => {
	const page = Math.max(0, Number(req.query.page ?? 0));
	const kind =
		typeof req.query.kind === "string" && req.query.kind !== "" ? req.query.kind : undefined;
	const username =
		typeof req.query.username === "string" && req.query.username !== ""
			? req.query.username
			: undefined;

	const actions = await GetActions({ page, kind, username });

	return res.status(200).json({
		success: true,
		description: "Done.",
		body: { actions, filters: { kind, username } },
	});
});

/**
 * @name GET /api/v1/admin/cron-tasks
 */
router.get("/cron-tasks", async (_req, res) => {
	const [tasks, executions] = await Promise.all([GetCronTasks(), GetCronTaskExecutions(100)]);

	return res.status(200).json({
		success: true,
		description: "Done.",
		body: { tasks, executions },
	});
});

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
	(_req, res) =>
		res.status(501).json({
			success: false,
			description: `Not implemented.`,
		}),
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

	const adminUserID = req[SYMBOL_TACHI_API_AUTH].userID;

	if (adminUserID === null) {
		return res.status(401).json({
			success: false,
			description: `You are not authenticated.`,
		});
	}

	const adminUser = await GetUserWithIDGuaranteed(adminUserID);
	const taker = { ip: req.ip, acct: { id: adminUser.id, username: adminUser.username } };

	await ACTION_DeleteScore(taker, { id: body.scoreID });

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

	const adminUserID = req[SYMBOL_TACHI_API_AUTH].userID;

	if (adminUserID === null) {
		return res.status(401).json({
			success: false,
			description: `You are not authenticated.`,
		});
	}

	const adminUser = await GetUserWithIDGuaranteed(adminUserID);
	const taker = { ip: req.ip, acct: { id: adminUser.id, username: adminUser.username } };

	await ACTION_DeleteSession(taker, { id: body.sessionID });

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

		const ugpt = await DB.selectFrom("game_profile")
			.where("user_id", "=", userID)
			.where("game", "=", GamePTToV3(game, playtype))
			.executeTakeFirst();

		if (!ugpt) {
			return res.status(404).json({
				success: false,
				description: `No stats for ${userID} (${game} ${playtype}) exist.`,
			});
		}

		await DestroyUserGameProfile(userID, game, playtype);

		return res.status(200).json({
			success: true,
			description: `Completely destroyed UGPT for ${userID} (${game} ${playtype}).`,
			body: {},
		});
	},
);

/**
 * Perform a site recalc on this set of scores.
 *
 * @name POST /api/v1/admin/recalc
 */
router.post("/recalc", (_req, res) =>
	res.status(501).json({
		success: false,
		description: `Not implemented.`,
	}),
);

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
	const target = await ResolveUser(req.params.userID);

	if (!target) {
		return res.status(404).json({
			success: false,
			description: `This user does not exist.`,
		});
	}

	const adminUserID = req[SYMBOL_TACHI_API_AUTH].userID;

	if (adminUserID === null) {
		return res.status(401).json({
			success: false,
			description: `You are not authenticated.`,
		});
	}

	const adminUser = await GetUserWithIDGuaranteed(adminUserID);
	const taker = { ip: req.ip, acct: { id: adminUser.id, username: adminUser.username } };

	await ACTION_SetUserSupporterStatus(taker, { userID: target.id, isSupporter: true });

	return res.status(200).json({
		success: true,
		description: `Done.`,
		body: {},
	});
});

/**
 * Un-Make this user a Tachi supporter.
 *
 * @name DELETE /api/v1/admin/supporter/:userID
 */
router.delete("/supporter/:userID", async (req, res) => {
	const target = await ResolveUser(req.params.userID);

	if (!target) {
		return res.status(404).json({
			success: false,
			description: `This user does not exist.`,
		});
	}

	const adminUserID = req[SYMBOL_TACHI_API_AUTH].userID;

	if (adminUserID === null) {
		return res.status(401).json({
			success: false,
			description: `You are not authenticated.`,
		});
	}

	const adminUser = await GetUserWithIDGuaranteed(adminUserID);
	const taker = { ip: req.ip, acct: { id: adminUser.id, username: adminUser.username } };

	await ACTION_SetUserSupporterStatus(taker, { userID: target.id, isSupporter: false });

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
router.post("/reprocess-all-goals", (_req, res) =>
	res.status(501).json({
		success: false,
		description: `Not implemented.`,
	}),
);

export default router;
