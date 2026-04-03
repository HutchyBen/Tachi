import { SubscribeFailReasons } from "#lib/constants/err-codes";
import { ToQuestDocument, ToQuestSubscriptionDocument } from "#lib/db-formats/target-documents";
import { log } from "#lib/log/log";
import { ServerConfig } from "#lib/setup/config";
import {
	EvaluateQuestProgress,
	GetGoalsInQuests,
	SubscribeToQuest,
	UnsubscribeFromQuest,
} from "#lib/targets/quests";
import { RequirePermissions } from "#server/middleware/auth";
import DB from "#services/pg/db";
import { AssignToReqTachiData, GetGPT, GetTachiData, GetUGPT } from "#utils/req-tachi-data";
import { FormatUserDoc } from "#utils/user";
import { type RequestHandler, Router } from "express";
import { GamePTToV3 } from "tachi-common";
import type { Game } from "tachi-db";
import { sql } from "kysely";

import { RequireAuthedAsUser } from "../../../../../middleware";

const router: Router = Router({ mergeParams: true });

/**
 * Retrieves this user's subscribed quests.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/targets/quests
 */
router.get("/", async (req, res) => {
	const { user, game, playtype } = GetUGPT(req);

	const v3Game = GamePTToV3(game, playtype);

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

	const questIds = questSubs.map((e) => e.questID);

	const questRows =
		questIds.length === 0
			? []
			: await DB.selectFrom("quest").selectAll().where("quest.id", "in", questIds).execute();

	if (questRows.length !== questSubs.length) {
		log.error(
			`Found ${questSubs.length} subscriptions, but got ${questRows.length} parents. This is a state desync.`,
		);
		throw new Error("Failed to fetch quests");
	}

	const questById = new Map(questRows.map((q) => [q.id, ToQuestDocument(q)]));

	const quests = questIds.map((id) => {
		const q = questById.get(id);

		if (!q) {
			throw new Error("Failed to fetch quests");
		}

		return q;
	});

	const goals = await GetGoalsInQuests(quests);

	return res.status(200).json({
		success: true,
		description: `Retrieved ${questSubs.length} quest(s).`,
		body: {
			quests,
			questSubs,
			goals,
		},
	});
});

const GetQuestSubscription: RequestHandler = async (req, res, next) => {
	const { user, game, playtype } = GetUGPT(req);

	const v3Game = GamePTToV3(game, playtype);

	const row = await DB.selectFrom("quest_sub")
		.innerJoin("quest", "quest.id", "quest_sub.quest_id")
		.selectAll("quest_sub")
		.select("quest.game as quest_game")
		.where("quest_sub.user_id", "=", user.id)
		.where("quest_sub.quest_id", "=", req.params.questID)
		.where("quest.game", "=", v3Game)
		.executeTakeFirst();

	if (!row) {
		return res.status(404).json({
			success: false,
			description: `${user.username} is not subscribed to this quest.`,
		});
	}

	const questSub = ToQuestSubscriptionDocument({
		quest_id: row.quest_id,
		user_id: row.user_id,
		progress: row.progress,
		last_interaction: row.last_interaction,
		achieved: row.achieved,
		time_achieved: row.time_achieved,
		was_instantly_achieved: row.was_instantly_achieved,
		quest_game: row.quest_game as Game,
	});

	AssignToReqTachiData(req, { questSubDoc: questSub });

	next();
};

const GetQuest: RequestHandler = async (req, res, next) => {
	const { game, playtype } = GetGPT(req);

	const v3Game = GamePTToV3(game, playtype);

	const row = await DB.selectFrom("quest")
		.selectAll()
		.where("quest.id", "=", req.params.questID)
		.where("quest.game", "=", v3Game)
		.executeTakeFirst();

	if (!row) {
		return res.status(404).json({
			success: false,
			description: `Can't find a quest with id '${req.params.questID}'.`,
		});
	}

	AssignToReqTachiData(req, { questDoc: ToQuestDocument(row) });

	next();
};

/**
 * Returns this user's progress on this quest.
 * This also evaluates individual progress on all of the quests goals.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/targets/quests/:questID
 */
router.get("/:questID", GetQuest, GetQuestSubscription, async (req, res) => {
	const { user } = GetUGPT(req);

	const questSub = GetTachiData(req, "questSubDoc");
	const quest = GetTachiData(req, "questDoc");

	const { goalResults: results, goals } = await EvaluateQuestProgress(user.id, quest);

	return res.status(200).json({
		success: true,
		description: `Returned information about ${FormatUserDoc(user)}'s progress on ${
			quest.name
		}.`,
		body: {
			questSub,
			quest,
			results,
			goals,
		},
	});
});

/**
 * Subscribe to a quest.
 *
 * @name PUT /api/v1/users/:userID/games/:game/:playtype/targets/quests/:questID
 */
router.put(
	"/:questID",
	RequireAuthedAsUser,
	GetQuest,
	RequirePermissions("manage_targets"),
	async (req, res) => {
		const { user, game, playtype } = GetUGPT(req);

		const v3Game = GamePTToV3(game, playtype);

		const countRow = await DB.selectFrom("quest_sub")
			.innerJoin("quest", "quest.id", "quest_sub.quest_id")
			.select(sql<number>`count(*)::int`.as("c"))
			.where("quest_sub.user_id", "=", user.id)
			.where("quest.game", "=", v3Game)
			.executeTakeFirst();

		const existingQuestsCount = Number(countRow?.c ?? 0);

		if (existingQuestsCount > ServerConfig.MAX_QUEST_SUBSCRIPTIONS) {
			return res.status(400).json({
				success: false,
				description: `You already have ${ServerConfig.MAX_QUEST_SUBSCRIPTIONS} quests. You cannot have anymore for this game.`,
			});
		}

		const quest = GetTachiData(req, "questDoc");

		const alreadySubscribed = await DB.selectFrom("quest_sub")
			.innerJoin("quest", "quest.id", "quest_sub.quest_id")
			.select("quest_sub.quest_id")
			.where("quest_sub.user_id", "=", user.id)
			.where("quest_sub.quest_id", "=", quest.questID)
			.where("quest.game", "=", v3Game)
			.executeTakeFirst();

		if (alreadySubscribed) {
			return res.status(409).json({
				success: false,
				description: `You are already subscribed to this goal.`,
			});
		}

		const subResult = await SubscribeToQuest(user.id, quest, false);

		if (subResult === SubscribeFailReasons.ALREADY_SUBSCRIBED) {
			return res.status(409).json({
				success: false,
				description: `You're already subscribed to this quest.`,
			});
		}

		return res.status(200).json({
			success: true,
			description: `Subscribed to quest '${quest.name}'.`,
			body: { ...subResult, quest },
		});
	},
);

/**
 * Unsubscribe from a quest.
 *
 * @name DELETE /api/v1/users/:userID/games/:game/:playtype/targets/quests/:questID
 */
router.delete(
	"/:questID",
	RequireAuthedAsUser,
	GetQuest,
	RequirePermissions("manage_targets"),
	async (req, res) => {
		const { user, game, playtype } = GetUGPT(req);
		const quest = GetTachiData(req, "questDoc");

		log.info(
			{
				quest,
				user,
			},
			`User ${FormatUserDoc(user)} is unsubscribing from quest '${quest.name}'.`,
		);

		const v3Game = GamePTToV3(game, playtype);

		const row = await DB.selectFrom("quest_sub")
			.innerJoin("quest", "quest.id", "quest_sub.quest_id")
			.selectAll("quest_sub")
			.select("quest.game as quest_game")
			.where("quest_sub.user_id", "=", user.id)
			.where("quest_sub.quest_id", "=", quest.questID)
			.where("quest.game", "=", v3Game)
			.executeTakeFirst();

		if (!row) {
			return res.status(409).json({
				success: false,
				description: `Can't unsubscribe from a quest you were never subscribed to.`,
			});
		}

		const questSub = ToQuestSubscriptionDocument({
			quest_id: row.quest_id,
			user_id: row.user_id,
			progress: row.progress,
			last_interaction: row.last_interaction,
			achieved: row.achieved,
			time_achieved: row.time_achieved,
			was_instantly_achieved: row.was_instantly_achieved,
			quest_game: row.quest_game as Game,
		});

		await UnsubscribeFromQuest(questSub, quest);

		return res.status(200).json({
			success: true,
			description: `Unsubscribed from quest.`,
			body: {
				quest,
			},
		});
	},
);

export default router;
