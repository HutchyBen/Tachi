import type { integer } from "tachi-common";

import MONGODB_KILL from "#services/mongo/db";
import { GetEnumDistForFolders } from "#utils/folder";
import { GetTimeXHoursAgo } from "#utils/misc";

// Various utils related to the player summary endpoint.
const REASONABLE_HOURS_AGO = 16;

export function GetRecentPlaycount(userID: integer) {
	const time = GetTimeXHoursAgo(REASONABLE_HOURS_AGO);

	return MONGODB_KILL.scores.count({ userID, timeAchieved: { $gte: time } });
}

export function GetRecentSessions(userID: integer) {
	const time = GetTimeXHoursAgo(REASONABLE_HOURS_AGO);

	return MONGODB_KILL.sessions.find({
		userID,
		timeEnded: { $gte: time },
	});
}

export async function GetRecentlyViewedFoldersAnyGPT(userID: integer) {
	const time = GetTimeXHoursAgo(REASONABLE_HOURS_AGO);

	const views = await MONGODB_KILL["recent-folder-views"].find(
		{
			userID,
			lastViewed: { $gte: time },
		},
		{
			sort: {
				lastViewed: -1,
			},
			limit: 4,
		},
	);

	const folders = await MONGODB_KILL.folders.find({
		folderID: { $in: views.map((e) => e.folderID) },
	});

	const stats = await GetEnumDistForFolders(userID, folders);

	// TODO: Sort recently viewed folders based on how recently viewed
	// they were.

	return { folders, stats };
}

export async function GetGoalSummary(userID: integer) {
	const time = GetTimeXHoursAgo(REASONABLE_HOURS_AGO);

	const achievedGoals = await MONGODB_KILL["goal-subs"].find({
		timeAchieved: { $gte: time },
		wasInstantlyAchieved: false,
		userID,
	});

	const improvedGoals = await MONGODB_KILL["goal-subs"].find({
		lastInteraction: { $gte: time },
		achieved: false,
		userID,
	});

	const goals = await MONGODB_KILL.goals.find({
		goalID: {
			$in: [...achievedGoals.map((e) => e.goalID), ...improvedGoals.map((e) => e.goalID)],
		},
	});

	return { achievedGoals, improvedGoals, goals };
}
