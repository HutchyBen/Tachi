import type { KtLogger } from "#lib/log/log";
import type {
	GameGroup,
	GoalImportInfo,
	integer,
	MONGO_QuestDocument,
	MONGO_QuestSubscriptionDocument,
	Playtype,
	QuestImportInfo,
} from "tachi-common";
import { GamePTToV3 } from "tachi-common";

import { ToQuestDocument, ToQuestSubscriptionDocument } from "#lib/db-formats/target-documents";
import { EvaluateQuestProgress, GetGoalIDsFromQuest } from "#lib/targets/quests";
import { EmitWebhookEvent } from "#lib/webhooks/webhooks";
import DB from "#services/pg/db";
import { UnixMillisecondsToISO8601 } from "#utils/time";
import type { Game } from "tachi-db";

export async function UpdateUsersQuests(
	importGoalInfo: Array<GoalImportInfo>,
	game: GameGroup,
	playtypes: Array<Playtype>,
	userID: integer,
	log: KtLogger,
) {
	const goalIDs = importGoalInfo.map((e) => e.goalID);

	const { quests, questSubs } = await GetRelevantQuests(goalIDs, game, playtypes, userID, log);

	return UpdateQuestsForUser(quests, questSubs, game, userID, log);
}

export async function UpdateQuestsForUser(
	quests: Array<MONGO_QuestDocument>,
	questSubs: Array<MONGO_QuestSubscriptionDocument>,

	game: GameGroup,
	userID: integer,
	log: KtLogger,
) {
	const questSubMap = new Map<string, MONGO_QuestSubscriptionDocument>();

	for (const um of questSubs) {
		questSubMap.set(um.questID, um);
	}

	const importQuestInfo: Array<QuestImportInfo> = [];

	await Promise.all(
		quests.map(async (quest) => {
			const { achieved, progress } = await EvaluateQuestProgress(userID, quest);

			const questSub = questSubMap.get(quest.questID);

			if (!questSub) {
				log.warn(
					`Invalid state achieved in quest processing - processed quest that user did not have? ${quest.questID}`,
				);

				return;
			}

			const questInfo = {
				questID: questSub.questID,
				old: {
					progress: questSub.progress,
					achieved: questSub.achieved,
				},
				new: {
					progress,
					achieved,
				},
			};

			const setPayload: {
				progress: number;
				achieved: boolean;
				last_interaction?: string;
				time_achieved?: string | null;
			} = {
				progress,
				achieved,
			};

			if (progress !== questSub.progress) {
				importQuestInfo.push(questInfo);
				setPayload.last_interaction = UnixMillisecondsToISO8601(Date.now());
			}

			if (achieved && !questSub.achieved) {
				void EmitWebhookEvent({
					type: "quest-achieved/v1",
					content: {
						userID,
						...questInfo,
						game,
						playtype: quest.playtype,
					},
				});

				setPayload.time_achieved = UnixMillisecondsToISO8601(Date.now());
			}

			await DB.updateTable("quest_sub")
				.set(setPayload)
				.where("quest_sub.quest_id", "=", quest.questID)
				.where("quest_sub.user_id", "=", userID)
				.execute();
		}),
	);

	return importQuestInfo;
}

async function GetRelevantQuests(
	goalIDs: Array<string>,
	game: GameGroup,
	playtypes: Array<Playtype>,
	userID: integer,
	log: KtLogger,
) {
	if (goalIDs.length === 0) {
		return { quests: [] as Array<MONGO_QuestDocument>, questSubs: [] };
	}

	const v3Games = playtypes.map((pt) => GamePTToV3(game, pt));
	const goalIdSet = new Set(goalIDs);

	const questSubRows = await DB.selectFrom("quest_sub")
		.innerJoin("quest", "quest.id", "quest_sub.quest_id")
		.selectAll("quest_sub")
		.select("quest.game as quest_game")
		.where("quest_sub.user_id", "=", userID)
		.where("quest.game", "in", v3Games)
		.execute();

	log.debug(`Found ${questSubRows.length} quest-subs.`);

	const questSubs = questSubRows.map((r) =>
		ToQuestSubscriptionDocument({
			...r,
			quest_game: r.quest_game as Game,
		}),
	);

	const questIds = [...new Set(questSubRows.map((r) => r.quest_id))];

	const questRows =
		questIds.length === 0
			? []
			: await DB.selectFrom("quest").selectAll().where("id", "in", questIds).execute();

	const quests = questRows
		.map(ToQuestDocument)
		.filter((q) => GetGoalIDsFromQuest(q).some((gid) => goalIdSet.has(gid)));

	log.debug(`Found ${quests.length} relevant quests.`);

	return { quests, questSubs };
}
