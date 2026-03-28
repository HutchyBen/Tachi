import type { KtLogger } from "#lib/log/log";
import type {
	GameGroup,
	integer,
	MONGO_GoalDocument,
	MONGO_GoalSubscriptionDocument,
} from "tachi-common";

import { EvaluateGoalForUser, GetRelevantGoals } from "#lib/targets/goals";
import { EmitWebhookEvent } from "#lib/webhooks/webhooks";
import MONGODB_KILL from "#services/mongo/db";

/**
 * Update a user's progress on all of their set goals.
 */
export async function GetAndUpdateUsersGoals(
	game: GameGroup,
	userID: integer,
	chartIDs: Set<string>,
	log: KtLogger,
) {
	const { goals, goalSubsMap } = await GetRelevantGoals(game, userID, chartIDs, log);

	if (!goals.length) {
		// if we hit the below code with an empty array mongodb will flip out on the bulkwrite op
		return [];
	}

	log.debug(`Found ${goals.length} relevant goals.`);

	return UpdateGoalsForUser(goals, goalSubsMap, userID, log);
}

export async function UpdateGoalsForUser(
	goals: Array<MONGO_GoalDocument>,
	goalSubsMap: Map<string, MONGO_GoalSubscriptionDocument>,
	userID: integer,
	log: KtLogger,
	skipMismatch = false,
) {
	const returns = await Promise.all(
		goals.map((goal: MONGO_GoalDocument) => {
			const goalSub = goalSubsMap.get(goal.goalID);

			if (!goalSub) {
				if (skipMismatch) {
					return null;
				}

				log.error(
					`UserGoal:GoalID mismatch ${goal.goalID} - this user has no goalSub for this, yet it is set.`,
				);

				return null;
			}

			return ProcessGoal(goal, goalSub, userID, log).catch((err: Error) => {
				log.warn(
					{ goal, err, userID, goalSub },
					`Failed to process goal '${goal.name}' for ${userID}, ${err.message}. Skipping.`,
				);

				return null;
			});
		}),
	);

	const importInfo = [];
	const bulkWrite = [];
	const webhookEventContent = [];

	for (const ret of returns) {
		if (!ret) {
			continue;
		}

		importInfo.push(ret.import);
		bulkWrite.push(ret.bwrite);

		if (ret.webhookEvent) {
			webhookEventContent.push(ret.webhookEvent);
		}
	}

	if (bulkWrite.length === 0) {
		// bulkwrite cannot be an empty array -- this means there's nothing to update or return, then.
		// i.e. goals was non empty but returns was entirely [undefined, undefined...].
		return [];
	}

	if (webhookEventContent.length !== 0 && goals[0]) {
		await EmitWebhookEvent({
			type: "goals-achieved/v1",
			content: { goals: webhookEventContent, userID, game: goals[0].game },
		});
	}

	await MONGODB_KILL["goal-subs"].bulkWrite(bulkWrite, { ordered: false });

	return importInfo;
}

/**
 * Calls EvaluateGoalForUser, then processes the returns into a bulkWrite
 * operation and an import statistic.
 * @returns undefined on error (i.e. EvaluateGoalForUser) OR if there's nothing
 * to say (i.e. user didnt raise the goal).
 */
export async function ProcessGoal(
	goal: MONGO_GoalDocument,
	goalSub: MONGO_GoalSubscriptionDocument,
	userID: integer,
	log: KtLogger,
) {
	const res = await EvaluateGoalForUser(goal, userID, log);

	if (!res) {
		// some sort of error occured - its logged by the previous function.
		return;
	}

	// nothing has changed
	if (goalSub.progress === res.progress && goalSub.outOf === res.outOf) {
		return;
	}

	const newData = {
		progress: res.progress,
		progressHuman: res.progressHuman,
		outOf: res.outOf,
		outOfHuman: res.outOfHuman,
		achieved: res.achieved,
	};

	const oldData = {
		progress: goalSub.progress,
		progressHuman: goalSub.progressHuman,
		outOf: goalSub.outOf,
		outOfHuman: goalSub.outOfHuman,
		achieved: goalSub.achieved,
	};

	let webhookEvent = null;

	// if this is a newly-achieved goal

	if (res.achieved && !goalSub.achieved) {
		webhookEvent = {
			goalID: goal.goalID,
			old: oldData,
			new: newData,
			playtype: goal.playtype,
		};
	}

	let newTimeAchieved = null;

	if (newData.achieved) {
		// if this goal was just achieved
		if (goalSub.timeAchieved === null) {
			newTimeAchieved = Date.now();
		} else {
			// keep the old timestamp
			newTimeAchieved = goalSub.timeAchieved;
		}
	}

	// otherwise if this goal wasn't achieved then the timeAchieved is always null

	const setData = {
		...newData,
		timeAchieved: newTimeAchieved,

		// we're guaranteed that this works, because things
		// that haven't changed return nothing instead of
		// getting to this point.
		lastInteraction: Date.now(),
	} as unknown as Partial<MONGO_GoalSubscriptionDocument>;

	// If this goal was achieved, and is now *not* achieved, we need to unset
	// some things.
	if (goalSub.achieved && !res.achieved) {
		log.info(
			{
				goal,
				res,
				goalSub,
			},
			`User ${userID} lost their achieved status on ${goal.name}.`,
		);

		// This goal can't be marked as instantly achieved, since it was lost.
		setData.wasInstantlyAchieved = false;
	}

	const bulkWrite = {
		updateOne: {
			filter: { goalID: goalSub.goalID, userID: goalSub.userID },
			update: {
				$set: setData,
			},
		},
	};

	return {
		bwrite: bulkWrite,
		import: {
			goalID: goal.goalID,
			old: oldData,
			new: newData,
		},
		webhookEvent,
	};
}

export async function UpdateGoalsInFolder(folderID: string, log: KtLogger) {
	const goals = await MONGODB_KILL.goals.find({
		"charts.type": "folder",
		"charts.data": folderID,
	});

	log.info(`Updating ${goals.length} goals for ${folderID}`);

	const goalSubs = await MONGODB_KILL["goal-subs"].find({
		goalID: { $in: goals.map((e) => e.goalID) },
	});

	log.info(`Updating ${goalSubs.length} goal subs for ${folderID}`);

	// (User -> (goalID -> GoalSub))
	const ugsMap = new Map<integer, Map<string, MONGO_GoalSubscriptionDocument>>();

	for (const gSub of goalSubs) {
		const userID = gSub.userID;

		if (ugsMap.has(userID)) {
			ugsMap.get(userID)!.set(gSub.goalID, gSub);
		} else {
			ugsMap.set(userID, new Map());
			ugsMap.get(userID)!.set(gSub.goalID, gSub);
		}
	}

	const promises = [];

	for (const [userID, goalSubsMap] of ugsMap.entries()) {
		promises.push(async () => {
			// hack: pass *all* goals here to avoid mass allocations
			// use `skipMismatch` to ignore the cases where they don't match
			await UpdateGoalsForUser(goals, goalSubsMap, userID, log, true);
		});
	}

	await Promise.all(promises);
}
