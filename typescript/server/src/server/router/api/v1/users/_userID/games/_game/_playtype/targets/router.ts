import { GetChartById } from "#lib/db-formats/chart";
import { LoadFolderDocumentById } from "#lib/db-formats/folders";
import {
	ToGoalDocument,
	ToGoalSubscriptionDocument,
	ToQuestSubscriptionDocument,
} from "#lib/db-formats/target-documents";
import { log } from "#lib/log/log";
import { GetRelevantGoals } from "#lib/targets/goals";
import { GetParentQuests } from "#lib/targets/quests";
import DB from "#services/pg/db";
import {
	GetRecentlyAchievedGoals,
	GetRecentlyAchievedQuests,
	GetRecentlyInteractedGoals,
	GetRecentlyInteractedQuests,
} from "#utils/db";
import { GetFolderChartIDs } from "#utils/folder";
import { GetUGPT } from "#utils/req-tachi-data";
import { Router } from "express";
import { GamePTToV3, MongoChartLegacyId } from "tachi-common";
import type { Game } from "tachi-db";

import goalsRouter from "./goals/router";
import questsRouter from "./quests/router";

const router: Router = Router({ mergeParams: true });

/**
 * Return a user's recently achieved goals and quests.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/targets/recently-achieved
 */
router.get("/recently-achieved", async (req, res) => {
	const { game, playtype, user } = GetUGPT(req);

	const userID = user.id;

	const [{ goals, goalSubs }, { quests, questSubs }] = await Promise.all([
		GetRecentlyAchievedGoals({ userID, game, playtype }),
		GetRecentlyAchievedQuests({ userID, game, playtype }),
	]);

	return res.status(200).json({
		success: true,
		description: `Returned ${user.username}'s recently achieved targets.`,
		body: {
			goals,
			quests,
			goalSubs,
			questSubs,
			user,
		},
	});
});

/**
 * Returns a user's recently interacted with (raised, etc.) goals and quests.
 * Note that this does not include recently achieved.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/targets/recently-raised
 */
router.get("/recently-raised", async (req, res) => {
	const { game, playtype, user } = GetUGPT(req);

	const userID = user.id;

	const [{ goals, goalSubs }, { quests, questSubs }] = await Promise.all([
		GetRecentlyInteractedGoals({ userID, game, playtype }),
		GetRecentlyInteractedQuests({ userID, game, playtype }),
	]);

	return res.status(200).json({
		success: true,
		description: `Returned ${user.username}'s recently achieved targets.`,
		body: {
			goals,
			quests,
			goalSubs,
			questSubs,
			user,
		},
	});
});

/**
 * Find what unachieved targets this user has set that consider this chart.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/targets/on-chart/:chartID
 */
router.get("/on-chart/:chartID", async (req, res) => {
	const { game, playtype, user } = GetUGPT(req);

	const chartIDParam = req.params.chartID;

	const chart = await GetChartById(GamePTToV3(game, playtype), chartIDParam);

	if (!chart) {
		return res.status(404).json({
			success: false,
			description: `Failed to find a chart with chartID '${chartIDParam}'.`,
		});
	}

	const { goals, goalSubsMap } = await GetRelevantGoals(
		game,
		user.id,
		new Set([MongoChartLegacyId(chart)]),
		log,
		false,
	);

	const goalSubs = [...goalSubsMap.values()];

	const quests = await GetParentQuests(user.id, game, playtype, goalSubs);

	const v3Game = GamePTToV3(game, playtype);
	const questIds = quests.map((e) => e.questID);

	const questSubRows =
		questIds.length === 0
			? []
			: await DB.selectFrom("quest_sub")
					.innerJoin("quest", "quest.id", "quest_sub.quest_id")
					.selectAll("quest_sub")
					.select("quest.game as quest_game")
					.where("quest_sub.user_id", "=", user.id)
					.where("quest.game", "=", v3Game)
					.where("quest_sub.quest_id", "in", questIds)
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

	return res.status(200).json({
		success: true,
		description: `Found pertinent goals`,
		body: {
			goals,
			goalSubs,
			quests,
			questSubs,
		},
	});
});

/**
 * Find what unachieved targets this user has set that involve this folder.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/targets/on-folder/:folderID
 */
router.get("/on-folder/:folderID", async (req, res) => {
	const { game, playtype, user } = GetUGPT(req);

	const folderID = req.params.folderID;

	const folder = await LoadFolderDocumentById(folderID);

	if (!folder || folder.game !== game || folder.playtype !== playtype) {
		return res.status(404).json({
			success: false,
			description: `Failed to find a folder with folderID '${folderID}'.`,
		});
	}

	const folderChartIDs = await GetFolderChartIDs(folderID);

	const v3Game = GamePTToV3(game, playtype);

	const allSubRows = await DB.selectFrom("goal_sub")
		.innerJoin("goal", "goal.id", "goal_sub.goal_id")
		.selectAll("goal_sub")
		.select("goal.game as goal_game")
		.where("goal_sub.user_id", "=", user.id)
		.where("goal.game", "=", v3Game)
		.execute();

	const allGoalSubs = allSubRows.map((r) =>
		ToGoalSubscriptionDocument({
			...r,
			goal_game: r.goal_game as Game,
		}),
	);

	const goalIDs = allGoalSubs.map((e) => e.goalID);

	const goalDocRows =
		goalIDs.length === 0
			? []
			: await DB.selectFrom("goal").selectAll().where("goal.id", "in", goalIDs).execute();

	const goals: Array<ReturnType<typeof ToGoalDocument>> = [];

	for (const row of goalDocRows) {
		const g = ToGoalDocument(row);

		if (g.charts.type === "single" && folderChartIDs.includes(g.charts.data)) {
			goals.push(g);
		} else if (
			g.charts.type === "multi" &&
			g.charts.data.some((c: string) => folderChartIDs.includes(c))
		) {
			goals.push(g);
		} else if (g.charts.type === "folder" && g.charts.data === folderID) {
			goals.push(g);
		}
	}

	const active = new Set(goals.map((g) => g.goalID));
	const goalSubs = allGoalSubs.filter((s) => active.has(s.goalID));

	const quests = await GetParentQuests(user.id, game, playtype, goalSubs);

	const questIds = quests.map((e) => e.questID);

	const questSubRows =
		questIds.length === 0
			? []
			: await DB.selectFrom("quest_sub")
					.innerJoin("quest", "quest.id", "quest_sub.quest_id")
					.selectAll("quest_sub")
					.select("quest.game as quest_game")
					.where("quest_sub.user_id", "=", user.id)
					.where("quest.game", "=", v3Game)
					.where("quest_sub.quest_id", "in", questIds)
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

	return res.status(200).json({
		success: true,
		description: `Found pertinent goals`,
		body: {
			goals,
			goalSubs,
			quests,
			questSubs,
		},
	});
});

/**
 * Retrieve all of this user's target subscriptions.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/targets/all-subs
 */
router.get("/all-subs", async (req, res) => {
	const { user, game, playtype } = GetUGPT(req);

	const v3Game = GamePTToV3(game, playtype);

	const [goalSubRows, questSubRows] = await Promise.all([
		DB.selectFrom("goal_sub")
			.innerJoin("goal", "goal.id", "goal_sub.goal_id")
			.selectAll("goal_sub")
			.select("goal.game as goal_game")
			.where("goal_sub.user_id", "=", user.id)
			.where("goal.game", "=", v3Game)
			.execute(),
		DB.selectFrom("quest_sub")
			.innerJoin("quest", "quest.id", "quest_sub.quest_id")
			.selectAll("quest_sub")
			.select("quest.game as quest_game")
			.where("quest_sub.user_id", "=", user.id)
			.where("quest.game", "=", v3Game)
			.execute(),
	]);

	const goalSubs = goalSubRows.map((r) =>
		ToGoalSubscriptionDocument({
			...r,
			goal_game: r.goal_game as Game,
		}),
	);

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

	return res.status(200).json({
		success: true,
		description: `Returned all target subscriptions.`,
		body: { goalSubs, questSubs },
	});
});

router.use("/goals", goalsRouter);
router.use("/quests", questsRouter);

export default router;
