import type {
	GameGroup,
	integer,
	MONGO_GoalDocument,
	MONGO_GoalSubscriptionDocument,
	MONGO_QuestDocument,
	MONGO_QuestSubscriptionDocument,
	Playtype,
} from "tachi-common";

import { SubscribeFailReasons } from "#lib/constants/err-codes";
import { log } from "#lib/log/log";
import { BulkSendNotification } from "#lib/notifications/notifications";
import MONGODB_KILL from "#services/mongo/db";

import {
	type EvaluatedGoalReturn,
	EvaluateGoalForUser,
	SubscribeToGoal,
	UnsubscribeFromGoal,
	UnsubscribeFromOrphanedGoalSubs,
} from "./goals";

/**
 * Retrieves the goalID documents in a single array from the
 * nested structure of quests.
 */
export function GetGoalIDsFromQuest(quest: MONGO_QuestDocument) {
	// this sucks - maybe a nicer way to do this, because nested
	// maps are just ugly
	return quest.questData.map((e) => e.goals.map((e) => e.goalID)).flat(1);
}

/**
 * Return all the goals inside this quest.
 */
export async function GetGoalsInQuest(quest: MONGO_QuestDocument) {
	const goalIDs = GetGoalIDsFromQuest(quest);

	const goals = await MONGODB_KILL.goals.find({
		goalID: { $in: goalIDs },
	});

	if (goals.length !== goalIDs.length) {
		log.error(
			{ goals: goals.length, quest, goalIDs: goalIDs.length },
			`Quest ${quest.name} has ${goalIDs.length} goals registered, but we could only find ${goals.length} in the database?`,
		);
		throw new Error(`Quest is corrupt. Not the right amount of goals in db?`);
	}

	// this shouldn't happen, but if it does it's recoverable by just ignoring it.
	if (goalIDs.length < 2) {
		log.warn(
			{
				quest,
			},
			`Quest ${quest.name} resolves to less than 2 goals. Isn't a valid quest?`,
		);
	}

	return goals;
}

/**
 * Return all the goals inside these quests
 */
export async function GetGoalsInQuests(quests: Array<MONGO_QuestDocument>) {
	const goalIDs = quests.flatMap((quest) => GetGoalIDsFromQuest(quest));

	const goals = await MONGODB_KILL.goals.find({
		goalID: { $in: goalIDs },
	});

	return goals;
}

/**
 * Work out how many goals need to be achieved for this
 * quest to be considered completed.
 */
export function CalculateQuestOutOf(quest: MONGO_QuestDocument) {
	const goalIDs = GetGoalIDsFromQuest(quest);

	return goalIDs.length;
}

type EvaluatedGoalResult = { goalID: string } & EvaluatedGoalReturn;

/**
 * Evaluate a user's progress on a quest, regardless of whether they have it
 * assigned or not.
 *
 * @returns All of the goals in the quest. The users progress on each individual goal,
 * their overall progress, what the quest was outOf, and whether they achieved it or
 * not.
 */
export async function EvaluateQuestProgress(userID: integer, quest: MONGO_QuestDocument) {
	const goals = await GetGoalsInQuest(quest);

	const isSubscribedToQuest = await MONGODB_KILL["quest-subs"].findOne({
		questID: quest.questID,
		userID,
	});

	// If the user is subscribed the quest, we don't need to calculate
	// their progress on each goal.
	const goalSubMap = new Map<string, MONGO_GoalSubscriptionDocument>();

	if (isSubscribedToQuest) {
		const goalSubs = await MONGODB_KILL["goal-subs"].find({
			goalID: { $in: goals.map((e) => e.goalID) },
			userID,
		});

		for (const sub of goalSubs) {
			goalSubMap.set(sub.goalID, sub);
		}
	}

	const goalResults: Array<EvaluatedGoalResult> = await Promise.all(
		goals.map(async (goal) => {
			if (isSubscribedToQuest) {
				let goalSub = goalSubMap.get(goal.goalID);

				if (!goalSub) {
					// shouldn't happen. Let's just correct the user silently.

					log.warn(
						`User ${userID} has a corrupt subscription to quest '${quest.name}', They do not have all the goals in this quest assigned. Automatically subscribing them to the new goal.`,
					);

					const newGoalSub = await SubscribeToGoal(userID, goal, false);

					if (newGoalSub === SubscribeFailReasons.ALREADY_SUBSCRIBED) {
						log.error(
							`User ${userID} wasn't subscribed to a goal (${goal.goalID}), but subscription failed because they were already subscribed. This should never happen.`,
						);
						throw new Error(
							`Quest subscription was corrupt and we failed to subscribe the user to the missing goal.`,
						);
					}

					if (newGoalSub === SubscribeFailReasons.ALREADY_ACHIEVED) {
						// lol, wut
						log.error(
							`Impossible via typesystem: attempted resubscription for user ${userID} on goal ${goal.goalID}, was rejected for being already achieved. Not possible, as we allow already achieved goals here.`,
						);

						throw new Error(
							`Quest subscription was corrupt and we failed to subscribe the user to the missing goal.`,
						);
					}

					goalSub = newGoalSub;
				}

				return {
					achieved: goalSub.achieved,
					progress: goalSub.progress,
					outOf: goalSub.outOf,
					progressHuman: goalSub.progressHuman,
					outOfHuman: goalSub.outOfHuman,
					goalID: goal.goalID,
				};
			}

			const result = await EvaluateGoalForUser(goal, userID, log);

			if (!result) {
				log.error(
					{ goal, quest },
					`Failed to calculate ${userID} result for goal '${goal.name}'. Is the goal valid?`,
				);

				throw new Error(`Goal inside quest is corrupt.`);
			}

			return {
				achieved: result.achieved,
				progress: result.progress,
				outOf: result.outOf,
				progressHuman: result.progressHuman,
				outOfHuman: result.outOfHuman,
				goalID: goal.goalID,
			};
		}),
	);

	const progress = goalResults.filter((e) => e.achieved).length;
	const outOf = CalculateQuestOutOf(quest);

	const achieved = progress >= outOf;

	return {
		goals,
		goalResults,
		achieved,
		progress,
		outOf,
	};
}

interface QuestSubscriptionReturns {
	questSub: MONGO_QuestSubscriptionDocument;
	goals: Array<MONGO_GoalDocument>;
	goalResults: Array<EvaluatedGoalResult>;
}

/**
 * Subscribes the given user to a provided quest. If the user is already subscribed,
 * null is returned.
 *
 * @param denyInstantAchievement - Don't subscribe to the quest if subscribing would cause
 * the user to immediately achieve it.
 */
export async function SubscribeToQuest(
	userID: integer,
	quest: MONGO_QuestDocument,
	denyInstantAchievement: false,
): Promise<QuestSubscriptionReturns | SubscribeFailReasons.ALREADY_SUBSCRIBED>;
export async function SubscribeToQuest(
	userID: integer,
	quest: MONGO_QuestDocument,
	denyInstantAchievement = true,
): Promise<
	| QuestSubscriptionReturns
	| SubscribeFailReasons.ALREADY_ACHIEVED
	| SubscribeFailReasons.ALREADY_SUBSCRIBED
> {
	const isSubscribedToQuest = await MONGODB_KILL["quest-subs"].findOne({
		userID,
		questID: quest.questID,
	});

	if (isSubscribedToQuest) {
		return SubscribeFailReasons.ALREADY_SUBSCRIBED;
	}

	const result = await EvaluateQuestProgress(userID, quest);

	if (result.achieved && denyInstantAchievement) {
		return SubscribeFailReasons.ALREADY_ACHIEVED;
	}

	// @ts-expect-error TS can't resolve this.
	// because it can't explode out the types.
	const questSub: MONGO_QuestSubscriptionDocument = {
		progress: result.progress,
		userID,
		questID: quest.questID,
		wasInstantlyAchieved: result.achieved,
		game: quest.game,
		playtype: quest.playtype,
		achieved: result.achieved,
		timeAchieved: result.achieved ? Date.now() : null,
		lastInteraction: null,
	};

	// @optimisable, EvaluateQuestProgress calculates the users progress
	// on each goal. We could probably shorten this by directly inserting the records
	// from result.goalResults ourselves.
	// evaluating goals is fairly cheap though.
	await Promise.all(result.goals.map((goal) => SubscribeToGoal(userID, goal, false)));

	await MONGODB_KILL["quest-subs"].insert(questSub);

	log.info(`User ${userID} subscribed to '${quest.name}'.`);

	return { questSub, goals: result.goals, goalResults: result.goalResults };
}

/**
 * Given a questID, update all of its subscriptions to potentially subscribe to any
 * new goals added to it.
 *
 * @note Updating quest subscriptions just means ensuring that any subscribing
 * users are also subscribed to all goals in that quest. Nothing more.
 *
 * A quest that removes goals will not result in those users having goal subs removed.
 */
export async function UpdateQuestSubscriptions(questID: string) {
	log.info(`Received update-subscribe call to quest ${questID}.`);

	const subscriptions = await MONGODB_KILL["quest-subs"].find({ questID });

	const maybeQuest = await MONGODB_KILL.quests.findOne({ questID });

	// if the quest was deleted, we have to take a more manual approach.
	if (!maybeQuest) {
		// first, remove all subs to this quest
		await MONGODB_KILL["quest-subs"].remove({
			questID,
		});

		// then, this presents us with an interesting problem.
		// We can't actually know what goals this user was subscribed to as a result
		// of this quest, because said quest no longer exists.

		// To mitigate this, we just prune all goalsubs that no longer have any
		// dependencies
		await Promise.all(
			subscriptions.map((e) => UnsubscribeFromOrphanedGoalSubs(e.userID, e.game, e.playtype)),
		);

		log.info(`Quest ${questID} has been deleted. Unsubscribed ${subscriptions.length} users.`);

		return;
	}

	// the easiest way to do this? unsubscribe all users from the quest, then subscribe
	// them all again.
	await Promise.all(subscriptions.map((e) => UnsubscribeFromQuest(e, maybeQuest)));

	await Promise.all(subscriptions.map((e) => SubscribeToQuest(e.userID, maybeQuest, false)));

	await BulkSendNotification(
		`The quest '${maybeQuest.name}' has received an update.`,
		subscriptions.map((e) => e.userID),
		{
			type: "QUEST_CHANGED",
			content: {
				questID,
				game: maybeQuest.game,
				playtype: maybeQuest.playtype,
			},
		},
	);
}

/**
 * Unsubscribe from a quest. This will also unsubscribe the user from any goals they're
 * subscribed to as a result.
 *
 * Returns nothing.
 */
export async function UnsubscribeFromQuest(
	questSub: MONGO_QuestSubscriptionDocument,
	quest: MONGO_QuestDocument,
) {
	const goalIDs = GetGoalIDsFromQuest(quest);

	// remove the quest sub
	// (preventing HAS_QUEST_DEPENDENCIES when this is the quest we're removing anyway)
	await MONGODB_KILL["quest-subs"].remove({
		questID: questSub.questID,
		userID: questSub.userID,
	});

	const goalSubs = await MONGODB_KILL["goal-subs"].find({
		userID: questSub.userID,
		goalID: { $in: goalIDs },
	});

	// unsub the user from all goals we can. If we can't unsub from a goal, that's
	// not a problem, we weren't meant to unsubscribe from it.
	await Promise.all(goalSubs.map((e) => UnsubscribeFromGoal(e, true)));
}

/**
 * Given an array of user goal subscriptions, return all the quests this user is
 * subscribed to that subsume these goals.
 */
export async function GetParentQuests(
	userID: integer,
	game: GameGroup,
	playtype: Playtype,
	goalSubs: Array<MONGO_GoalSubscriptionDocument>,
) {
	const questSubs: Array<{ questID: string }> = await MONGODB_KILL["quest-subs"].find(
		{
			game,
			playtype,
			userID,
		},
		{
			projection: {
				questID: 1,
			},
		},
	);

	const questSubIDs = questSubs.map((e) => e.questID);

	const quests = await MONGODB_KILL.quests.find({
		questID: { $in: questSubIDs },
		"questData.goals.goalID": { $in: goalSubs.map((e) => e.goalID) },
	});

	return quests;
}

/**
 * Find all quests not in any questlines.
 */
export async function FindStandaloneQuests(game: GameGroup, playtype: Playtype) {
	const res: Array<MONGO_QuestDocument> = await MONGODB_KILL.quests.aggregate([
		{
			$match: {
				game,
				playtype,
			},
		},
		{
			$lookup: {
				from: "questlines",
				localField: "questID",
				foreignField: "quests",
				as: "parentQuestlines",
			},
		},
		{
			$match: {
				// is an empty array
				"parentQuestlines.0": { $exists: false },
			},
		},
	]);

	return res;
}
