import type { Game } from "tachi-db";

import { ACTION_AddGoal } from "#actions/add-goal";
import { ACTION_RemoveGoalSubscription } from "#actions/remove-goal-subscription";
import {
	ToGoalDocument,
	ToGoalSubscriptionDocument,
	ToQuestSubscriptionDocument,
} from "#lib/db-formats/target-documents";
import { GetQuestsThatContainGoal } from "#lib/targets/goals";
import { GetParentQuests } from "#lib/targets/quests";
import { RequirePermissions } from "#server/middleware/auth";
import prValidate from "#server/middleware/prudence-validate";
import DB from "#services/pg/db";
import { GetGoalForIDGuaranteed, GetGoalSubscriptionForIDGuaranteed } from "#utils/db";
import { AssignToReqTachiData, GetTachiData, GetUGPT } from "#utils/req-tachi-data";
import { type RequestHandler, Router } from "express";
import { p } from "prudence";
import { GamePTToV3, type MONGO_GoalDocument, type MONGO_QuestDocument } from "tachi-common";

import { RequireAuthedAsUser } from "../../../../../middleware";

const router: Router = Router({ mergeParams: true });

/**
 * Retrieves this user's set goals for this GPT.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/targets/goals
 */
router.get("/", async (req, res) => {
	const { user, game, playtype } = GetUGPT(req);

	const v3Game = GamePTToV3(game, playtype);

	const subRows = await DB.selectFrom("goal_sub")
		.innerJoin("goal", "goal.id", "goal_sub.goal_id")
		.selectAll("goal_sub")
		.select("goal.game as goal_game")
		.where("goal_sub.user_id", "=", user.id)
		.where("goal.game", "=", v3Game)
		.execute();

	const goalSubs = subRows.map((r) =>
		ToGoalSubscriptionDocument({
			...r,
			goal_game: r.goal_game as Game,
		}),
	);

	const goalIds = goalSubs.map((e) => e.goalID);

	const goalRows =
		goalIds.length === 0
			? []
			: await DB.selectFrom("goal").selectAll().where("goal.id", "in", goalIds).execute();

	const goals = goalRows.map(ToGoalDocument);

	const allQuests = await GetParentQuests(user.id, game, playtype, goalSubs);

	const questSubRows = await DB.selectFrom("quest_sub")
		.innerJoin("quest", "quest.id", "quest_sub.quest_id")
		.selectAll("quest_sub")
		.select("quest.game as quest_game")
		.where("quest_sub.user_id", "=", user.id)
		.where("quest.game", "=", v3Game)
		.execute();

	const questSubs = questSubRows.map((r) =>
		ToQuestSubscriptionDocument({
			quest_id: r.quest_id,
			user_id: r.user_id,
			progress: r.progress,
			last_interaction: r.last_interaction,
			achieved: r.achieved,
			time_achieved: r.time_achieved,
			was_instantly_achieved: r.was_instantly_achieved,
			quest_game: r.quest_game as Game,
		}),
	);

	const questSubIDs = questSubs.map((e) => e.questID);

	const quests = allQuests.filter((quest) => questSubIDs.includes(quest.questID));

	return res.status(200).json({
		success: true,
		description: `Retrieved ${goalSubs.length} goal(s).`,
		body: {
			goals,
			goalSubs,
			quests,
			questSubs,
		},
	});
});

type GoalCreationBody = Pick<MONGO_GoalDocument, "charts" | "criteria">;

/**
 * Add a goal to your account. If the goal document already exists, it is subscribed to.
 * Otherwise, that goal document is created, and then subscribed to.
 *
 * @param criteria.key - The key for the goal to be on. This is stuff like scoreData.percent.
 * @param criteria.value - The value the key must be greater than for it to count as achieved.
 * @param criteria.mode - "single", "absolute" or "proportion". If abs or proportion, countNum
 * must be supplied.
 * @param criteria.countNum - For abs/proportion mode. Atleast N scores must achieve the
 * key:value condition.
 *
 * @param charts.type - "single", "multi" or "folder".
 * @param charts.data - an identifier for the set of charts must be
 * supplied here. For single, this is a chartID. For multi, this is an array of chartIDs.
 * For folder, this is a folderID.
 *
 * @name POST /api/v1/users/:userID/games/:game/:playtype/targets/goals/add-goal
 */
router.post(
	"/add-goal",
	RequireAuthedAsUser,
	RequirePermissions("manage_targets"),
	prValidate({
		criteria: {
			// we do proper validation on this later.
			key: "string",
			value: p.gte(0),

			mode: p.isIn("single", "absolute", "proportion"),
			countNum: (self, parent) => {
				if (parent.mode === "single") {
					return (
						self === undefined ||
						"Invalid countNum for mode 'single'. Must not have one!"
					);
				}

				// proper validation later.
				return p.gte(0)(self);
			},
		},
		charts: {
			type: p.isIn("single", "multi", "folder"),
			data: (self, parent) => {
				if (parent.type === "single") {
					return (
						typeof self === "string" ||
						"Expected a string in charts.data due to charts.type being 'single'."
					);
				} else if (parent.type === "multi") {
					return (
						(Array.isArray(self) &&
							self.every((k) => typeof k === "string") &&
							self.length <= 10 &&
							self.length > 1) ||
						"Expected an array of 2 to 10 strings in charts.data due to charts.type being 'multi'."
					);
					/* istanbul ignore next */
				} else if (parent.type === "folder") {
					return (
						typeof self === "string" ||
						"Expected a string in charts.data due to charts.type being 'folder'."
					);
				}

				// impossible to reach, so doesn't count for coverage.
				/* istanbul ignore next */
				return "Unknown charts.type.";
			},
		},
	}),
	async (req, res) => {
		const { user, game, playtype } = GetUGPT(req);

		const sessionUser = req.session.tachi?.user;

		if (!sessionUser) {
			return res.status(401).json({
				success: false,
				description: "You are not authenticated.",
			});
		}

		const data = req.safeBody as GoalCreationBody;

		const taker = { ip: req.ip, acct: { id: sessionUser.id, username: sessionUser.username } };

		const { goalID } = await ACTION_AddGoal(taker, {
			userID: user.id,
			game,
			playtype,
			charts: data.charts,
			criteria: data.criteria,
		});

		const goal = await GetGoalForIDGuaranteed(goalID);
		const goalSub = await GetGoalSubscriptionForIDGuaranteed(goalID, user.id);

		return res.status(200).json({
			success: true,
			description: `Subscribed to ${goal.name}.`,
			body: {
				goal,
				goalSub,
			},
		});
	},
);

const GetGoalSubscription: RequestHandler = async (req, res, next) => {
	const { user, game, playtype } = GetUGPT(req);

	const v3Game = GamePTToV3(game, playtype);

	const row = await DB.selectFrom("goal_sub")
		.innerJoin("goal", "goal.id", "goal_sub.goal_id")
		.selectAll("goal_sub")
		.select("goal.game as goal_game")
		.where("goal_sub.user_id", "=", user.id)
		.where("goal_sub.goal_id", "=", req.params.goalID)
		.where("goal.game", "=", v3Game)
		.executeTakeFirst();

	if (!row) {
		return res.status(404).json({
			success: false,
			description: `${user.username} is not subscribed to this goal.`,
		});
	}

	const goalSub = ToGoalSubscriptionDocument({
		...row,
		goal_game: row.goal_game as Game,
	});

	AssignToReqTachiData(req, { goalSubDoc: goalSub });

	next();
};

/**
 * Reads information about the users subscription to this goal ID.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/targets/goals/:goalID
 */
router.get("/:goalID", GetGoalSubscription, async (req, res) => {
	const { user } = GetUGPT(req);

	const goalSub = GetTachiData(req, "goalSubDoc");

	const quests: Array<MONGO_QuestDocument> = await GetQuestsThatContainGoal(goalSub.goalID);

	const goal = await GetGoalForIDGuaranteed(goalSub.goalID);

	return res.status(200).json({
		success: true,
		description: `Returned information about goal '${goal.name}'.`,
		body: {
			goal,
			goalSub,
			quests,
			user,
		},
	});
});

/**
 * Unsubscribe from a goal.
 *
 * @name DELETE /api/v1/users/:userID/games/:game/:playtype/targets/goals/:goalID
 */
router.delete(
	"/:goalID",
	RequireAuthedAsUser,
	RequirePermissions("manage_targets"),
	async (req, res) => {
		const { user, game, playtype } = GetUGPT(req);

		const sessionUser = req.session.tachi?.user;

		if (!sessionUser) {
			return res.status(401).json({
				success: false,
				description: "You are not authenticated.",
			});
		}

		const taker = { ip: req.ip, acct: { id: sessionUser.id, username: sessionUser.username } };

		await ACTION_RemoveGoalSubscription(taker, {
			userID: user.id,
			game,
			playtype,
			goalID: req.params.goalID,
		});

		return res.status(200).json({
			success: true,
			description: `Removed this goal from your subscriptions.`,
			body: {},
		});
	},
);

export default router;
