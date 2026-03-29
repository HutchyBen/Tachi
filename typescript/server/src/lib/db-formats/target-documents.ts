import { ISO8601ToUnixMilliseconds } from "#utils/time";
import {
	type MONGO_GoalDocument,
	type MONGO_GoalSubscriptionDocument,
	type MONGO_QuestDocument,
	type MONGO_QuestSubscriptionDocument,
	V3ToGamePT,
} from "tachi-common";
import { type Game, type Goal, type GoalSub, type Quest, type QuestSub } from "tachi-db";

export function ToGoalDocument(row: Goal): MONGO_GoalDocument {
	const { game, playtype } = V3ToGamePT(row.game);

	return {
		goalID: row.id,
		game,
		playtype,
		name: row.name,
		charts: row.charts as MONGO_GoalDocument["charts"],
		criteria: row.criteria as MONGO_GoalDocument["criteria"],
	} as MONGO_GoalDocument;
}

export function ToGoalSubscriptionDocument(
	row: { goal_game: Game } & GoalSub,
): MONGO_GoalSubscriptionDocument {
	const { game, playtype } = V3ToGamePT(row.goal_game);

	const base = {
		game,
		playtype,
		goalID: row.goal_id,
		userID: row.user_id,
		lastInteraction: row.last_interaction
			? ISO8601ToUnixMilliseconds(row.last_interaction)
			: null,
		outOf: row.out_of,
		outOfHuman: row.out_of_human,
		progress: row.progress,
		progressHuman: row.progress_human,
		wasAssignedStandalone: row.was_assigned_standalone,
		wasInstantlyAchieved: row.was_instantly_achieved,
	};

	if (!row.achieved) {
		return { ...base, achieved: false, timeAchieved: null };
	}

	return {
		...base,
		achieved: true,
		timeAchieved: row.time_achieved ? ISO8601ToUnixMilliseconds(row.time_achieved) : 0,
	};
}

export function ToQuestDocument(row: Quest): MONGO_QuestDocument {
	const { game, playtype } = V3ToGamePT(row.game);

	return {
		questID: row.id,
		game,
		playtype,
		name: row.name,
		desc: row.description,
		questData: row.quest_data as MONGO_QuestDocument["questData"],
	};
}

export function ToQuestSubscriptionDocument(
	row: { quest_game: Game } & QuestSub,
): MONGO_QuestSubscriptionDocument {
	const { game, playtype } = V3ToGamePT(row.quest_game);

	const base = {
		game,
		playtype,
		questID: row.quest_id,
		userID: row.user_id,
		progress: row.progress,
		lastInteraction: row.last_interaction
			? ISO8601ToUnixMilliseconds(row.last_interaction)
			: null,
		wasInstantlyAchieved: row.was_instantly_achieved,
	};

	if (!row.achieved) {
		return { ...base, achieved: false, timeAchieved: null };
	}

	return {
		...base,
		achieved: true,
		timeAchieved: row.time_achieved ? ISO8601ToUnixMilliseconds(row.time_achieved) : 0,
	};
}
