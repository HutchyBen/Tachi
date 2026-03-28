import {
	type APIPermissions,
	type GamePTConfig,
	type GPTString,
	type GPTStringToGame,
	type ImportTrackerFailed,
	type integer,
	type MONGO_ChallengeSubscriptionDocument,
	type MONGO_ChartDocument,
	type MONGO_ClassAchievementDocument,
	type MONGO_FolderDocument,
	type MONGO_GoalDocument,
	type MONGO_GoalSubscriptionDocument,
	type MONGO_ImportDocument,
	type MONGO_PBScoreDocument,
	type MONGO_QuestDocument,
	type MONGO_QuestlineDocument,
	type MONGO_QuestSubscriptionDocument,
	type MONGO_ScoreDocument,
	type MONGO_SessionDocument,
	type MONGO_SongDocument,
	type MONGO_TableDocument,
	type MONGO_UserDocument,
	type MONGO_UserGameStats,
	type MONGO_UserGameStatsSnapshotDocument,
	type ProfileRatingAlgorithms,
	type SessionScoreInfo,
	type ShowcaseStatChart,
	type ShowcaseStatFolder,
} from "tachi-common";

export interface UGPTStatsReturn<GPT extends GPTString = GPTString> {
	gameStats: MONGO_UserGameStats;
	firstScore: MONGO_ScoreDocument<GPT>;
	mostRecentScore: MONGO_ScoreDocument<GPT>;
	totalScores: number;
	rankingData: Record<
		ProfileRatingAlgorithms[GPT],
		{
			outOf: integer;
			ranking: integer;
		}
	>;
	playtime: number;
}

export interface UGPTLeaderboardAdjacent {
	above: MONGO_UserGameStats[];
	below: MONGO_UserGameStats[];
	users: MONGO_UserDocument[];
	thisUsersStats: MONGO_UserGameStats;
	thisUsersRanking: {
		outOf: integer;
		ranking: integer;
	};
}

export interface GPTLeaderboard {
	gameStats: MONGO_UserGameStats[];
	users: MONGO_UserDocument[];
}

export type UGPTPreferenceStatsReturn =
	| {
			related: {
				chart: MONGO_ChartDocument;
				song: MONGO_SongDocument;
			};
			result: { value: number | null };
			stat: ShowcaseStatChart;
	  }
	| {
			related: { folder: MONGO_FolderDocument };
			result: { outOf: integer; value: integer };
			stat: ShowcaseStatFolder;
	  };

export type UGPTHistory = Omit<
	MONGO_UserGameStatsSnapshotDocument,
	"game" | "playtype" | "userID"
>[];

export interface SessionReturns<GPT extends GPTString = GPTString> {
	session: MONGO_SessionDocument;
	scores: MONGO_ScoreDocument[];
	scoreInfo: Array<SessionScoreInfo>;
	songs: MONGO_SongDocument<GPTStringToGame[GPT]>[];
	charts: MONGO_ChartDocument<GPT>[];
	user: MONGO_UserDocument;
}

export interface UGPTChartPBComposition<GPT extends GPTString = GPTString> {
	scores: MONGO_ScoreDocument<GPT>[];
	chart: MONGO_ChartDocument<GPT>;
	pb: MONGO_PBScoreDocument<GPT>;
}

export type UGSWithRankingData<GPT extends GPTString = GPTString> = {
	__rankingData: Record<ProfileRatingAlgorithms[GPT], { outOf: number; ranking: number }>;
} & MONGO_UserGameStats;

export interface SongChartsSearch<GPT extends GPTString = GPTString> {
	songs: MONGO_SongDocument<GPTStringToGame[GPT]>[];
	charts: MONGO_ChartDocument<GPT>[];
}

export interface FolderStatsInfo {
	stats: Record<string, Record<string, integer>>;
	folderID: string;
	chartCount: integer;
}

export interface UGPTFolderSearch {
	folders: MONGO_FolderDocument[];
	stats: FolderStatsInfo[];
}

export interface UGPTTableReturns {
	folders: MONGO_FolderDocument[];
	stats: FolderStatsInfo[];
	table: MONGO_TableDocument;
}

export interface UGPTFolderReturns<GPT extends GPTString = GPTString> {
	folder: MONGO_FolderDocument;
	songs: MONGO_SongDocument<GPTStringToGame[GPT]>[];
	charts: MONGO_ChartDocument<GPT>[];
	pbs: MONGO_PBScoreDocument<GPT>[];
}

export interface GPTFolderReturns<GPT extends GPTString = GPTString> {
	folder: MONGO_FolderDocument;
	songs: MONGO_SongDocument<GPTStringToGame[GPT]>[];
	charts: MONGO_ChartDocument<GPT>[];
}

export interface GPTStatsReturn {
	config: GamePTConfig;
	playerCount: integer;
	chartCount: integer;
	scoreCount: integer;
}

export interface RecentClassesReturn {
	classes: MONGO_ClassAchievementDocument[];
	users: MONGO_UserDocument[];
}

export interface SongsReturn<GPT extends GPTString = GPTString> {
	song: MONGO_SongDocument<GPTStringToGame[GPT]>;
	charts: MONGO_ChartDocument<GPT>[];
}

export interface ChartPBLeaderboardReturn<GPT extends GPTString = GPTString> {
	users: MONGO_UserDocument[];
	pbs: MONGO_PBScoreDocument<GPT>[];
}

export interface UGPTChartLeaderboardAdjacent<GPT extends GPTString = GPTString> {
	users: MONGO_UserDocument[];
	pb: MONGO_PBScoreDocument<GPT>;
	adjacentAbove: MONGO_PBScoreDocument<GPT>[];
	adjacentBelow: MONGO_PBScoreDocument<GPT>[];
}

export interface ScoreLeaderboardReturns<GPT extends GPTString = GPTString> {
	users: MONGO_UserDocument[];
	songs: MONGO_SongDocument<GPTStringToGame[GPT]>[];
	charts: MONGO_ChartDocument<GPT>[];
	pbs: MONGO_PBScoreDocument<GPT>[];
}

export interface UserLeaderboardReturns {
	users: MONGO_UserDocument[];
	gameStats: MONGO_UserGameStats[];
}

export interface UserRecentSummary {
	recentPlaycount: integer;
	recentSessions: MONGO_SessionDocument[];
	recentFolders: MONGO_FolderDocument[];
	recentFolderStats: FolderStatsInfo[];
	recentGoals: MONGO_GoalDocument[];
	recentImprovedGoals: MONGO_GoalSubscriptionDocument[];
	recentAchievedGoals: MONGO_GoalSubscriptionDocument[];
}

export interface ServerStatus {
	serverTime: number;
	startTime: number;
	version: string;
	whoami: integer | null;
	permissions: APIPermissions[];
}

export interface ChallengeSubsReturn {
	rivals: Array<MONGO_UserDocument>;
	pbs: Array<MONGO_PBScoreDocument>;
	challengeSubs: Array<MONGO_ChallengeSubscriptionDocument>;
	songs: Array<MONGO_SongDocument>;
	charts: Array<MONGO_ChartDocument>;
}

export interface ChartRivalsReturn {
	rivals: Array<MONGO_UserDocument>;
	pbs: Array<MONGO_PBScoreDocument>;
}

export interface ImportIDReturn {
	scores: MONGO_ScoreDocument[];
	songs: MONGO_SongDocument[];
	charts: MONGO_ChartDocument[];
	sessions: MONGO_SessionDocument[];
	import: MONGO_ImportDocument;
	user: MONGO_UserDocument;
}

export interface FailedImportsReturn {
	failedImports: Array<ImportTrackerFailed>;
	users: Array<MONGO_UserDocument>;
}

export interface ImportsReturn {
	imports: Array<MONGO_ImportDocument>;
	users: Array<MONGO_UserDocument>;
}

export interface ActivityReturn {
	recentSessions: Array<MONGO_SessionDocument>;

	songs: Array<MONGO_SongDocument>;
	charts: Array<MONGO_ChartDocument>;
	recentlyHighlightedScores: Array<MONGO_ScoreDocument>;
	achievedClasses: Array<MONGO_ClassAchievementDocument>;

	goals: Array<MONGO_GoalDocument>;
	quests: Array<MONGO_QuestDocument>;

	// recently achieved goal/quest subs
	goalSubs: Array<MONGO_GoalSubscriptionDocument>;
	questSubs: Array<MONGO_QuestSubscriptionDocument>;

	users: Array<MONGO_UserDocument>;
}

export type RecordActivityReturn = Partial<Record<GPTString, ActivityReturn>>;

export interface GoalsOnChartReturn {
	goals: Array<MONGO_GoalDocument>;
	goalSubs: Array<MONGO_GoalSubscriptionDocument>;
	quests: Array<MONGO_QuestDocument>;
	questSubs: Array<MONGO_QuestSubscriptionDocument>;
}

export type GoalsOnFolderReturn = GoalsOnChartReturn;
export type AllUGPTGoalsReturn = GoalsOnChartReturn;

export interface RecentlyAchievedOrRaisedTargets {
	goals: Array<MONGO_GoalDocument>;
	quests: Array<MONGO_QuestDocument>;
	goalSubs: Array<MONGO_GoalSubscriptionDocument>;
	questSubs: Array<MONGO_QuestSubscriptionDocument>;
	user: MONGO_UserDocument;
}

export interface GPTQuestsReturn {
	goals: Array<MONGO_GoalDocument>;
	quests: Array<MONGO_QuestDocument>;
}

export interface UGPTTargetSubs {
	goalSubs: Array<MONGO_GoalSubscriptionDocument>;
	questSubs: Array<MONGO_QuestSubscriptionDocument>;
}

export interface QuestlineReturn {
	questline: MONGO_QuestlineDocument;
	quests: Array<MONGO_QuestDocument>;
	goals: Array<MONGO_GoalDocument>;
}

export interface QuestReturn {
	quest: MONGO_QuestDocument;
	questSubs: Array<MONGO_QuestSubscriptionDocument>;
	users: Array<MONGO_UserDocument>;
	goals: Array<MONGO_GoalDocument>;
	parentQuestlines: Array<MONGO_QuestlineDocument>;
}

export type SessionFolderRaises = {
	folder: MONGO_FolderDocument;
	previousCount: integer; // how many AAAs/HARD CLEARs/whatevers was on this
	raisedCharts: Array<string>; // Array<chartID>;
	// folder before this session?
	totalCharts: integer;
	type: string;
	value: string;
};
