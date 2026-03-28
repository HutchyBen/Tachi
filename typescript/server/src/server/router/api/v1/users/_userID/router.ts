import type { AnyProfileRatingAlg, GPTString, integer, MONGO_UserGameStats } from "tachi-common";

import { ACTION_ChangeEmail } from "#actions/change-email.js";
import { ACTION_ChangePassword } from "#actions/change-password.js";
import { ACTION_ChangeUsername } from "#actions/change-username.js";
import { ACTION_UpdateUser } from "#actions/update-user.js";
import { GetRecentActivity } from "#lib/activity/activity";
import { ONE_MONTH } from "#lib/constants/time";
import { SELECT_GAME_PROFILE, ToGameStatsDocument } from "#lib/db-formats/game-profiles.js";
import { log } from "#lib/log/log";
import { GetRivalIDs } from "#lib/rivals/rivals";
import prValidate from "#server/middleware/prudence-validate";
import DB from "#services/pg/db.js";
import { optNullFluffStrField } from "#utils/prudence";
import {
	GetGoalSummary,
	GetRecentlyViewedFoldersAnyGPT,
	GetRecentPlaycount,
	GetRecentSessions,
} from "#utils/queries/summary";
import { GetUser } from "#utils/req-tachi-data";
import {
	CanChangeUsername,
	FormatUserDoc,
	GetAllRankings,
	GetNextAvailableUsernameChange,
	GetSettingsForUser,
	GetUserWithIDGuaranteed,
} from "#utils/user";
import { Router } from "express";
import { p } from "prudence";

import { ValidateEmail, ValidatePassword } from "../../../../../../lib/auth/auth";
import apiTokensRouter from "./api-tokens/router";
import bannerRouter from "./banner/router";
import followingRouter from "./following/router";
import gameSpecificRouter from "./games/@gameSpecificRoutes/router";
import gamePTRouter from "./games/_game/_playtype/router";
import importsRouter from "./imports/router";
import integrationsRouter from "./integrations/router";
import invitesRouter from "./invites/router";
import { GetUserFromParam, RequireSelfRequestFromUser } from "./middleware";
import notifsRouter from "./notifications/router";
import pfpRouter from "./pfp/router";
import sessionsRouter from "./sessions/router";
import settingsRouter from "./settings/router";

const router: Router = Router({ mergeParams: true });

router.use(GetUserFromParam);

/**
 * Get the user at this ID or name.
 * @name GET /api/v1/users/:userID
 */
router.get("/", (req, res) => {
	const user = GetUser(req);

	return res.status(200).json({
		success: true,
		description: `Found user ${user.username}.`,
		body: user,
	});
});

interface UserPatchBody {
	about?: string;
	status?: string | null;
	discord?: string | null;
	twitter?: string | null;
	twitch?: string | null;
	youtube?: string | null;
	github?: string | null;
	steam?: string | null;
}

/**
 * Modify this user document. All parameters are optional.
 *
 * @param about - An about me, this is rendered as markdown.
 * @param status - A user status. This is not rendered as markdown, and is short.
 * @param discord - The user's discord tag.
 * @param twitter - The user's twitter tag.
 * @param github - The user's github.
 * @param steam - The user's steamID.
 * @param youtube - The user's youtube.
 * @param twitch - The user's twitch.
 *
 * @name PATCH /api/v1/users/:userID
 */
router.patch(
	"/",
	RequireSelfRequestFromUser,
	prValidate(
		{
			about: p.optional(p.isBoundedString(0, 2000)),
			status: optNullFluffStrField,
			discord: optNullFluffStrField,
			twitter: optNullFluffStrField,
			github: optNullFluffStrField,
			steam: optNullFluffStrField,
			youtube: optNullFluffStrField,
			twitch: optNullFluffStrField,
		},
		{
			about: "Your about me is too long.",
		},
	),
	async (req, res) => {
		const user = GetUser(req);

		const body = req.safeBody as UserPatchBody;

		await ACTION_UpdateUser(
			{
				acct: {
					id: user.id,
					username: user.username,
				},
				ip: req.ip,
			},
			body,
		);

		const newUser = await GetUserWithIDGuaranteed(user.id);

		if (req.session.tachi?.user) {
			req.session.tachi.user = newUser;
			req.session.save();
		}

		return res.status(200).json({
			success: true,
			description: `Successfully updated user.`,
			body: newUser,
		});
	},
);

/**
 * Returns all of the game-stats this user has.
 * Additionally, adds a __rankingData property, which contains this users
 * ranking information.
 * This endpoint doubles up as a way of checking what games a user has played.
 *
 * @name GET /api/v1/users/:userID/game-stats
 */
router.get("/game-stats", async (req, res) => {
	const user = GetUser(req);

	// a user has played a game if and only if they have stats for it.
	const stats: Array<
		{
			__rankingData?: Record<AnyProfileRatingAlg, { outOf: number; ranking: number }>;
		} & MONGO_UserGameStats
	> = await DB.selectFrom("game_profile")
		.select(SELECT_GAME_PROFILE)
		.where("user_id", "=", user.id)
		.execute()
		.then((res) => res.map(ToGameStatsDocument));

	await Promise.all(
		stats.map(async (s) => {
			const data = await GetAllRankings(s);

			s.__rankingData = data;
		}),
	);

	return res.status(200).json({
		success: true,
		description: `Returned ${stats.length} stats objects.`,
		body: stats,
	});
});

/**
 * Returns a summary of what the user has achieved in the past 16 hours.
 * Used on the main dashboard page to give users quick links to sessions,
 * alongside other information.
 *
 * @name GET /api/v1/users/:userID/recent-summary
 */
router.get("/recent-summary", async (req, res) => {
	const user = GetUser(req);

	const [
		recentPlaycount,
		recentSessions,
		{ folders: recentFolders, stats: recentFolderStats },
		{ achievedGoals, goals, improvedGoals },
	] = await Promise.all([
		GetRecentPlaycount(user.id),
		GetRecentSessions(user.id),
		GetRecentlyViewedFoldersAnyGPT(user.id),
		GetGoalSummary(user.id),
	]);

	return res.status(200).json({
		success: true,
		description: `Retrieved information about ${FormatUserDoc(user)}.`,
		body: {
			recentPlaycount,
			recentSessions,
			recentFolders,
			recentFolderStats,
			recentAchievedGoals: achievedGoals,
			recentGoals: goals,
			recentImprovedGoals: improvedGoals,
		},
	});
});

/**
 * Returns whether the user has verified their email or not.
 * Requires self-key level permissions.
 *
 * @name GET /api/v1/users/:userID/is-email-verified
 */
router.get("/is-email-verified", RequireSelfRequestFromUser, async (req, res) => {
	const user = GetUser(req);

	const verifyInfo = await DB.selectFrom("priv_verify_email_token")
		.where("user_id", "=", user.id)
		.executeTakeFirst();

	if (verifyInfo) {
		return res.status(200).json({
			success: true,
			description: `User has not verified email.`,
			body: false,
		});
	}

	return res.status(200).json({
		success: true,
		description: `User has verified email.`,
		body: true,
	});
});

/**
 * Get what email this user signed up with.
 *
 * @name GET /api/v1/users/:userID/email
 */
router.get("/email", RequireSelfRequestFromUser, async (req, res) => {
	const user = GetUser(req);

	const email = await DB.selectFrom("priv_account_credential")
		.select("email")
		.where("user_id", "=", user.id)
		.executeTakeFirstOrThrow();

	if (email) {
		return res.status(200).json({
			success: true,
			description: `User signed up with this email.`,
			body: email.email,
		});
	}

	log.error(`User ${user.id} doesn't have private info?`);

	return res.status(500).json({
		success: false,
		description: `Internal Server Error`,
	});
});

/**
 * Change what email is associated with this account.
 *
 * @name GET /api/v1/users/:userID/email
 */
router.post(
	"/change-email",
	RequireSelfRequestFromUser,
	prValidate({
		email: ValidateEmail,
		"!password": ValidatePassword,
	}),
	async (req, res) => {
		const user = GetUser(req);

		const body = req.safeBody as {
			"!password": string;
			email: string;
		};

		await ACTION_ChangeEmail(
			{
				acct: {
					id: user.id,
					username: user.username,
				},
				ip: req.ip,
			},
			{
				email: body.email,
				"!password": body["!password"],
			},
		);

		return res.status(200).json({
			success: true,
			description: `Re-sent email verification to new email`,
			body: null,
		});
	},
);

/**
 * Changes the users password.
 * Requires self-key level permissions.
 *
 * @param !password - The new password. Must pass password validation rules.
 * @param !oldPassword - The old password.
 *
 * @name POST /api/v1/users/:userID/change-password
 */
router.post(
	"/change-password",
	RequireSelfRequestFromUser,
	prValidate({
		"!password": ValidatePassword,
		"!oldPassword": ValidatePassword,
	}),
	async (req, res) => {
		const body = req.safeBody as {
			"!oldPassword": string;
			"!password": string;
		};

		const user = req.session.tachi?.user;

		/* istanbul ignore next */
		if (!user) {
			log.error(
				`IP ${req.ip} got to /change-password without a user, but passed RequireSelfRequest?`,
			);

			// this should be a 500, but lie to them.
			return res.status(403).json({
				success: false,
				description: `You are not authorised to perform this action.`,
			});
		}

		await ACTION_ChangePassword(
			{
				acct: {
					id: user.id,
					username: user.username,
				},
				ip: req.ip,
			},
			{
				"!oldPassword": body["!oldPassword"],
				"!password": body["!password"],
			},
		);

		return res.status(200).json({
			success: true,
			description: `Updated Password.`,
			body: {},
		});
	},
);

/**
 * Changes the users username.
 * Requires self-key level permissions.
 *
 * @param !password - The new password. Must pass password validation rules.
 * @param newUsername - The new username. Must pass username validation rules.
 *
 * @name POST /api/v1/users/:userID/change-username
 */
router.post(
	"/change-username",
	RequireSelfRequestFromUser,
	prValidate(
		{
			"!password": ValidatePassword,
			newUsername: p.regex(/^[a-zA-Z_-][a-zA-Z0-9_-]{2,20}$/u),
		},
		{
			newUsername:
				"Username must be between 3 and 20 characters long, can only contain alphanumeric characters and cannot start with a number.",
			"!password": "Invalid password.",
		},
	),
	async (req, res) => {
		const body = req.safeBody as {
			"!password": string;
			newUsername: string;
		};

		const user = req.session.tachi?.user;

		/* istanbul ignore next */
		if (!user) {
			log.error(
				`IP ${req.ip} got to /change-username without a user, but passed RequireSelfRequest?`,
			);

			// this should be a 500, but lie to them.
			return res.status(403).json({
				success: false,
				description: `You are not authorised to perform this action.`,
			});
		}

		await ACTION_ChangeUsername(
			{
				acct: {
					id: user.id,
					username: user.username,
				},
				ip: req.ip,
			},
			{
				newUsername: body.newUsername,
				"!password": body["!password"],
			},
		);

		if (req.session.tachi?.user) {
			req.session.tachi.user = {
				...user,
				username: body.newUsername,
			};
			req.session.save();
		}

		return res.status(200).json({
			success: true,
			description: `Updated your username!`,
			body: {},
		});
	},
);

/**
 * Get the last time the user changed their username,
 * and whether they can change their username again.
 *
 * @name GET /api/v1/users/:userID/last-username-change
 */
router.get("/last-username-change", RequireSelfRequestFromUser, async (req, res) => {
	const user = GetUser(req);

	const nextAvailableChange = await GetNextAvailableUsernameChange(DB, user.id);

	const canChange = await CanChangeUsername(DB, user.id);

	let body;

	if (canChange) {
		body = {
			canChange: true,
		};
	} else {
		body = {
			canChange: false,
			nextAvailableChange,
		};
	}

	return res.status(200).json({
		success: true,
		description: `User can ${canChange ? "change" : "not change"} their username.`,
		body,
	});
});
/**
 * Get the recent import types this user has used.
 *
 * @name GET /api/v1/users/:userID/recent-imports
 */
router.get("/recent-imports", async (req, res) => {
	const user = GetUser(req);

	const rows = await DB.selectFrom("import")
		.select(["import_type", (eb) => eb.fn.countAll<number>().as("count")])
		.where("user_id", "=", user.id)
		.where("time_finished", ">", new Date(Date.now() - ONE_MONTH).toISOString())
		.where("user_intent", "=", true)
		.where("import_type", "not in", [
			"file/mypagescraper-records-csv",
			"file/mypagescraper-player-csv",
		])
		.groupBy("import_type")
		.execute();

	const imports = rows.map((row) => ({
		importType: row.import_type,
		count: Number(row.count),
	}));

	return res.status(200).json({
		success: true,
		description: `Found ${imports.length} imports.`,
		body: imports.sort((a, b) => b.count - a.count),
	});
});

/**
 * Get stats for this user on all games.
 *
 * @name GET /api/v1/users/:userID/stats
 */
router.get("/stats", async (req, res) => {
	const user = GetUser(req);

	const [scoreCount, sessionCount] = await Promise.all([
		DB.selectFrom("score")
			.select((eb) => eb.fn.countAll<number>().as("count"))
			.where("user_id", "=", user.id)
			.executeTakeFirstOrThrow()
			.then((r) => Number(r.count)),
		DB.selectFrom("session")
			.select((eb) => eb.fn.countAll<number>().as("count"))
			.where("user_id", "=", user.id)
			.executeTakeFirstOrThrow()
			.then((r) => Number(r.count)),
	]);

	return res.status(200).json({
		success: true,
		description: `Retrieved stats.`,
		body: {
			scores: scoreCount,
			sessions: sessionCount,
		},
	});
});

/**
 * Fetch this users recent activity, and all of their rivals for each GPT they've played.
 *
 * @name GET /api/v1/users/:userID/activity
 */
router.get(
	"/activity",
	prValidate({
		startTime: "*string",
		includeRivals: p.optional(p.isIn("true", "false")),
		includeFollowers: p.optional(p.isIn("true", "false")),
	}),
	async (req, res) => {
		const qStartTime = req.query.startTime as string | undefined;

		const includeRivals = req.query.includeRivals === "true";
		const includeFollowers = req.query.includeFollowers === "true";

		const startTime = qStartTime ? Number(qStartTime) : null;

		if (Number.isNaN(startTime)) {
			return res.status(400).json({
				success: false,
				description: `Invalid startTime, got a non number.`,
			});
		}

		const user = GetUser(req);

		const gameProfileRows = await DB.selectFrom("game_profile")
			.select(SELECT_GAME_PROFILE)
			.where("user_id", "=", user.id)
			.execute();

		const gpts = gameProfileRows.map(ToGameStatsDocument);

		const data: Partial<Record<GPTString, unknown>> = {};

		const settings = await GetSettingsForUser(user.id);

		await Promise.all(
			gpts.map(async (e) => {
				const userIDs: Array<integer> = [user.id];

				if (includeRivals) {
					const rivalIDs = await GetRivalIDs(user.id, e.game, e.playtype);

					userIDs.push(...rivalIDs);
				}

				// n.b. it is intentional behaviour that you only get updates for
				// people you follow on games you play.
				if (includeFollowers) {
					userIDs.push(...settings.following);
				}

				const activity = await GetRecentActivity(
					e.game,
					{
						game: e.game,
						playtype: e.playtype,
						userID: { $in: userIDs },
					},
					30,
					startTime,
				);

				data[`${e.game}:${e.playtype}` as GPTString] = activity;
			}),
		);

		return res.status(200).json({
			success: true,
			description: `Returned recent activity.`,
			body: data,
		});
	},
);

router.use("/games", gameSpecificRouter);
router.use("/games/:game/:playtype", gamePTRouter);
router.use("/pfp", pfpRouter);

router.use("/banner", bannerRouter);
router.use("/integrations", integrationsRouter);
router.use("/settings", settingsRouter);
router.use("/api-tokens", apiTokensRouter);
router.use("/invites", invitesRouter);
router.use("/imports", importsRouter);
router.use("/notifications", notifsRouter);
router.use("/following", followingRouter);
router.use("/sessions", sessionsRouter);

// Shims for discord functionality; discord checks that a url ends with ".png"
// to use as an image
router.get("/pfp.png", (_req, res) => {
	res.redirect("./pfp");
});
router.get("/banner.png", (_req, res) => {
	res.redirect("./banner");
});

export default router;
