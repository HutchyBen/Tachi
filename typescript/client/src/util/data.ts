import { type GoalsOnChartReturn, type GoalsOnFolderReturn } from "#types/api-returns";
import {
	type GameGroup,
	type GPTString,
	type integer,
	type MONGO_ChartDocument,
	type MONGO_GoalDocument,
	type MONGO_QuestDocument,
	type MONGO_ScoreDocument,
	type MONGO_SongDocument,
	type MONGO_UserDocument,
	type SessionScoreInfo,
} from "tachi-common";

export function GetPBs(scoreInfo: SessionScoreInfo[]) {
	return scoreInfo.filter((e) => {
		if (e.isNewScore) {
			return true;
		}

		for (const v of Object.values(e.deltas)) {
			if (v >= 0) {
				return true;
			}
		}

		return false;
	});
}

export function CreateSongMap<G extends GameGroup = GameGroup>(songs: MONGO_SongDocument<G>[]) {
	const songMap = new Map<integer, MONGO_SongDocument<G>>();

	for (const song of songs) {
		songMap.set(song.id, song);
	}

	return songMap;
}

export function CreateUserMap(users: MONGO_UserDocument[]) {
	const userMap = new Map<integer, MONGO_UserDocument>();

	for (const user of users) {
		userMap.set(user.id, user);
	}

	return userMap;
}

export function CreateGoalMap(goals: MONGO_GoalDocument[]) {
	const goalMap = new Map<string, MONGO_GoalDocument>();

	for (const goal of goals) {
		goalMap.set(goal.goalID, goal);
	}

	return goalMap;
}

export function CreateChartIDMap<T extends { chartID: string }>(arr: T[]): Map<string, T> {
	const map = new Map();

	for (const t of arr) {
		map.set(t.chartID, t);
	}

	return map;
}

export function CreateChartMap<GPT extends GPTString = GPTString>(
	charts: MONGO_ChartDocument<GPT>[],
) {
	const chartMap = new Map<string, MONGO_ChartDocument<GPT>>();

	for (const chart of charts) {
		chartMap.set(chart.chartID, chart);
	}

	return chartMap;
}

export function CreateScoreIDMap<GPT extends GPTString = GPTString>(
	scores: MONGO_ScoreDocument<GPT>[],
) {
	const scoreMap = new Map<string, MONGO_ScoreDocument<GPT>>();

	for (const score of scores) {
		scoreMap.set(score.scoreID, score);
	}

	return scoreMap;
}

export function CreateChartLink(chart: MONGO_ChartDocument, game: GameGroup) {
	return `/games/${game}/${chart.playtype}/charts/${chart.chartID}`;
}

// stolen from server
export function GetGoalIDsFromQuest(quest: MONGO_QuestDocument) {
	// this sucks - maybe a nicer way to do this, because nested
	// maps are just ugly
	return quest.questData.map((e) => e.goals.map((e) => e.goalID)).flat(1);
}

export function CreateGoalSubDataset(
	data: GoalsOnChartReturn | GoalsOnFolderReturn,
	userMap: Map<integer, MONGO_UserDocument>,
) {
	const dataset = [];
	const goalMap = CreateGoalMap(data.goals);

	for (const sub of data.goalSubs) {
		const goal = goalMap.get(sub.goalID);

		if (!goal) {
			console.warn(
				`No goal was sent for ${sub.userID}:${sub.goalID}, yet was a subscription?`,
			);
			continue;
		}

		const user = userMap.get(sub.userID);

		if (!user) {
			console.warn(
				`No user was set for ${sub.userID}:${sub.goalID}, yet was a subscription?`,
			);
			continue;
		}

		const parentQuests = data.quests.filter((q) =>
			GetGoalIDsFromQuest(q).includes(goal.goalID),
		);

		dataset.push({
			...sub,
			__related: {
				goal,
				user,
				parentQuests,
			},
		});
	}

	return dataset;
}
