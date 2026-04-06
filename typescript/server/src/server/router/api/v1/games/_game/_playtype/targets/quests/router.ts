import { SELECT_QUEST, SELECT_QUEST_SUB_WITH_QUEST_GAME } from "#lib/db-formats/quest";
import { SELECT_QUESTLINE_ROW } from "#lib/db-formats/questline";
import { ToQuestDocument, ToQuestSubscriptionDocument } from "#lib/db-formats/target-documents";
import { GetGoalsInQuest, GetGoalsInQuests } from "#lib/targets/quests";
import DB from "#services/pg/db";
import { EscapeForILIKE } from "#utils/misc";
import { AssignToReqTachiData, GetGPT, GetTachiData } from "#utils/req-tachi-data";
import { GetUsersWithIDs } from "#utils/user";
import { type RequestHandler, Router } from "express";
import { GamePTToV3, V3ToGamePT } from "tachi-common";

const router: Router = Router({ mergeParams: true });

const ResolveQuestID: RequestHandler = async (req, res, next) => {
	const { game, playtype } = GetGPT(req);
	const questID = req.params.questID;

	const v3Game = GamePTToV3(game, playtype);

	const row = await DB.selectFrom("quest")
		.select(SELECT_QUEST)
		.where("quest.id", "=", questID)
		.where("quest.game", "=", v3Game)
		.executeTakeFirst();

	if (!row) {
		return res.status(404).json({
			success: false,
			description: `A quest with ID ${questID} doesn't exist.`,
		});
	}

	AssignToReqTachiData(req, { questDoc: ToQuestDocument(row) });

	next();
};

/**
 * Search quests for this GPT.
 *
 * @param search - The query to search for.
 *
 * @name GET /api/v1/games/:game/:playtype/targets/quests
 */
router.get("/", async (req, res) => {
	const { game, playtype } = GetGPT(req);

	if (typeof req.query.search !== "string") {
		return res.status(400).json({
			success: false,
			description: `Invalid value for search.`,
		});
	}

	const v3Game = GamePTToV3(game, playtype);
	const likeEsc = EscapeForILIKE(req.query.search.trim());
	const pattern = `%${likeEsc}%`;

	const rows = await DB.selectFrom("quest")
		.select(SELECT_QUEST)
		.where("quest.game", "=", v3Game)
		.where((eb) =>
			eb.or([eb("quest.name", "ilike", pattern), eb("quest.description", "ilike", pattern)]),
		)
		.limit(50)
		.execute();

	const quests = rows.map(ToQuestDocument);
	const goals = await GetGoalsInQuests(quests);

	return res.status(200).json({
		success: true,
		description: `Returned ${quests.length} quests.`,
		body: { quests, goals },
	});
});

/**
 * Retrieve information about this quest and who is subscribed to it.
 *
 * @name GET /api/v1/games/:game/:playtype/targets/quests/:questID
 */
router.get("/:questID", ResolveQuestID, async (req, res) => {
	const quest = GetTachiData(req, "questDoc");

	const questSubRows = await DB.selectFrom("quest_sub")
		.innerJoin("quest", "quest.id", "quest_sub.quest_id")
		.select(SELECT_QUEST_SUB_WITH_QUEST_GAME)
		.where("quest_sub.quest_id", "=", quest.questID)
		.execute();

	const questSubs = questSubRows.map((r) => ToQuestSubscriptionDocument(r));

	const users = await GetUsersWithIDs(questSubs.map((e) => e.userID));

	const goals = await GetGoalsInQuest(quest);

	const qlRows = await DB.selectFrom("questline")
		.innerJoin("questline_quest", "questline_quest.questline_id", "questline.id")
		.select(SELECT_QUESTLINE_ROW)
		.where("questline_quest.quest_id", "=", quest.questID)
		.execute();

	const parentQuestlines = qlRows.map((ql) => {
		const { game: gg, playtype: pt } = V3ToGamePT(ql.game);

		return {
			questlineID: ql.id,
			name: ql.name,
			desc: ql.description,
			game: gg,
			playtype: pt,
		};
	});

	return res.status(200).json({
		success: true,
		description: `Retrieved information about ${quest.name}.`,
		body: {
			quest,
			questSubs,
			users,
			goals,
			parentQuestlines,
		},
	});
});

export default router;
