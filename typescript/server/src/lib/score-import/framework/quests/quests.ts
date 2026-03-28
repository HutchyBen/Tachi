import type { KtLogger } from "#lib/log/log";
import type { BulkWriteUpdateOneOperation } from "mongodb";
import type {
	GameGroup,
	GoalImportInfo,
	integer,
	MONGO_QuestDocument,
	MONGO_QuestSubscriptionDocument,
	Playtype,
	QuestImportInfo,
} from "tachi-common";

import { EvaluateQuestProgress } from "#lib/targets/quests";
import { EmitWebhookEvent } from "#lib/webhooks/webhooks";
import MONGODB_KILL from "#services/mongo/db";

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
	// create a map here to avoid linear searching when
	// co-iterating
	const questSubMap = new Map<string, MONGO_QuestSubscriptionDocument>();

	for (const um of questSubs) {
		questSubMap.set(um.questID, um);
	}

	const bwrite: Array<BulkWriteUpdateOneOperation<MONGO_QuestSubscriptionDocument>> = [];

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

			const bwriteOp: BulkWriteUpdateOneOperation<MONGO_QuestSubscriptionDocument> = {
				updateOne: {
					filter: { questID: quest.questID, userID },
					update: {
						$set: {
							achieved,
							progress,
						},
					},
				},
			};

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

			if (progress !== questSub.progress) {
				importQuestInfo.push(questInfo);

				// @ts-expect-error This property isn't read only, because I said so.
				bwriteOp.updateOne.update.$set!.lastInteraction = Date.now();
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

				// make sure we mark the time achieved if this was just achieved.
				// @ts-expect-error This property isn't read only, because I said so.
				bwriteOp.updateOne.update.$set!.timeAchieved = Date.now();
			}

			bwrite.push(bwriteOp);
		}),
	);

	if (bwrite.length !== 0) {
		await MONGODB_KILL["quest-subs"].bulkWrite(bwrite, { ordered: false });
	}

	return importQuestInfo;
}

async function GetRelevantQuests(
	goalIDs: Array<string>,
	game: GameGroup,
	playtypes: Array<Playtype>,
	userID: integer,
	log: KtLogger,
) {
	const questSubs = await MONGODB_KILL["quest-subs"].find({
		game,
		playtype: { $in: playtypes },
		userID,
	});

	log.debug(`Found ${questSubs.length} quest-subs.`);

	const quests = await MONGODB_KILL.quests.find({
		questID: { $in: questSubs.map((e) => e.questID) },
		"questData.goals.goalID": { $in: goalIDs },
	});

	log.debug(`Found ${quests.length} relevant quests.`);

	return { questSubs, quests };
}
