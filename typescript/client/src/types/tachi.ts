import {
	type integer,
	type MONGO_ChartDocument,
	type MONGO_ClassAchievementDocument,
	type MONGO_GoalDocument,
	type MONGO_GoalSubscriptionDocument,
	type MONGO_QuestDocument,
	type MONGO_QuestSubscriptionDocument,
	type MONGO_ScoreDocument,
	type MONGO_SessionDocument,
	type MONGO_SongDocument,
} from "tachi-common";

export type ClumpedActivityScores = {
	scores: Array<
		{
			__related: { chart: MONGO_ChartDocument; song: MONGO_SongDocument };
		} & MONGO_ScoreDocument
	>;
	type: "SCORES";
};

export type ClumpedActivitySession = {
	type: "SESSION";
} & MONGO_SessionDocument;

export type ClumpedActivityClassAchievement = {
	type: "CLASS_ACHIEVEMENT";
} & MONGO_ClassAchievementDocument;

export type ClumpedActivityGoalAchievement = {
	goals: Array<{ __related: { goal: MONGO_GoalDocument } } & MONGO_GoalSubscriptionDocument>;
	type: "GOAL_ACHIEVEMENTS";
	// redundant, but convenient.
	userID: integer;
};

export type ClumpedActivityQuestAchievement = {
	quest: MONGO_QuestDocument;
	sub: MONGO_QuestSubscriptionDocument;
	type: "QUEST_ACHIEVEMENT";
	userID: integer;
};

export type ClumpedActivity = Array<
	| ClumpedActivityClassAchievement
	| ClumpedActivityGoalAchievement
	| ClumpedActivityQuestAchievement
	| ClumpedActivityScores
	| ClumpedActivitySession
>;

/**
 * A 'raw' quest document is one without goalID references -- that is -- they inline
 * what goals they have.
 *
 * This is convenient for editing and storing in localStorage so people can create their
 * own quests.
 */
export type RawQuestDocument = {
	rawQuestData: Array<RawQuestSection>;
} & Omit<MONGO_QuestDocument, "questData" | "questID">;

export type RawQuestSection = {
	desc: string;
	rawGoals: Array<RawQuestGoal>;
	title: string;
};

export type RawQuestGoal = {
	goal: Pick<MONGO_GoalDocument, "charts" | "criteria" | "name">;
	note?: string;
};
