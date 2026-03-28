import {
	type GPTString,
	type GPTStringToGame,
	type ImportTrackerFailed,
	type integer,
	type MONGO_ChartDocument,
	type MONGO_GoalDocument,
	type MONGO_GoalSubscriptionDocument,
	type MONGO_ImportDocument,
	type MONGO_PBScoreDocument,
	type MONGO_QuestDocument,
	type MONGO_ScoreDocument,
	type MONGO_SongDocument,
	type MONGO_UserDocument,
	type MONGO_UserGameStats,
} from "tachi-common";

export type PBDataset<GPT extends GPTString = GPTString> = ({
	__playcount?: integer;
	__related: {
		chart: MONGO_ChartDocument<GPT>;
		index: integer;
		song: MONGO_SongDocument<GPTStringToGame[GPT]>;
		user?: MONGO_UserDocument;
	};
} & MONGO_PBScoreDocument<GPT>)[];

export type ScoreDataset<GPT extends GPTString = GPTString> = ({
	__related: {
		chart: MONGO_ChartDocument<GPT>;
		index: integer;
		song: MONGO_SongDocument<GPTStringToGame[GPT]>;
		user: MONGO_UserDocument;
	};
} & MONGO_ScoreDocument<GPT>)[];

export type FolderDataset<GPT extends GPTString = GPTString> = ({
	__related: {
		pb: MONGO_PBScoreDocument<GPT> | null;
		song: MONGO_SongDocument<GPTStringToGame[GPT]>;
		user: MONGO_UserDocument;
	};
} & MONGO_ChartDocument<GPT>)[];

export type ChartLeaderboardDataset<GPT extends GPTString = GPTString> = ({
	__related: {
		user: MONGO_UserDocument;
	};
} & MONGO_PBScoreDocument<GPT>)[];

export type UGSDataset = ({
	__related: {
		index: integer;
		user: MONGO_UserDocument;
	};
} & MONGO_UserGameStats)[];

export type RivalChartDataset<GPT extends GPTString = GPTString> = ({
	__related: {
		index: number;
		pb: MONGO_PBScoreDocument<GPT> | null;
	};
} & MONGO_UserDocument)[];

export type ComparePBsDataset<GPT extends GPTString = GPTString> = Array<{
	base: MONGO_PBScoreDocument<GPT> | null;
	chart: MONGO_ChartDocument;
	compare: MONGO_PBScoreDocument<GPT> | null;
	song: MONGO_SongDocument;
}>;

export type ImportDataset = Array<
	{
		__related: {
			user: MONGO_UserDocument;
		};
	} & MONGO_ImportDocument
>;

export type FailedImportDataset = Array<
	{
		__related: {
			user: MONGO_UserDocument;
		};
	} & ImportTrackerFailed
>;

export type GoalSubDataset = ({
	__related: {
		goal: MONGO_GoalDocument;
		parentQuests: Array<MONGO_QuestDocument>;
		user: MONGO_UserDocument;
	};
} & MONGO_GoalSubscriptionDocument)[];
