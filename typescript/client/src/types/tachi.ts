import {
	type ChartDocument,
	type ClassAchievementDocument,
	type GoalDocument,
	type GoalSubscriptionDocument,
	type integer,
	type QuestDocument,
	type QuestSubscriptionDocument,
	type ScoreDocument,
	type SessionDocument,
	type SongDocument,
} from "tachi-common";

export type ClumpedActivityScores = {
	scores: Array<
		{
			__related: { chart: ChartDocument; song: SongDocument };
		} & ScoreDocument
	>;
	type: "SCORES";
};

export type ClumpedActivitySession = {
	type: "SESSION";
} & SessionDocument;

export type ClumpedActivityClassAchievement = {
	type: "CLASS_ACHIEVEMENT";
} & ClassAchievementDocument;

export type ClumpedActivityGoalAchievement = {
	goals: Array<{ __related: { goal: GoalDocument } } & GoalSubscriptionDocument>;
	type: "GOAL_ACHIEVEMENTS";
	// redundant, but convenient.
	userID: integer;
};

export type ClumpedActivityQuestAchievement = {
	quest: QuestDocument;
	sub: QuestSubscriptionDocument;
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
} & Omit<QuestDocument, "questData" | "questID">;

export type RawQuestSection = {
	desc: string;
	rawGoals: Array<RawQuestGoal>;
	title: string;
};

export type RawQuestGoal = {
	goal: Pick<GoalDocument, "charts" | "criteria" | "name">;
	note?: string;
};
