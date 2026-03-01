import {
	type ChartDocument,
	type GoalDocument,
	type GoalSubscriptionDocument,
	type GPTString,
	type GPTStringToGame,
	type ImportDocument,
	type ImportTrackerFailed,
	type integer,
	type PBScoreDocument,
	type QuestDocument,
	type ScoreDocument,
	type SongDocument,
	type UserDocument,
	type UserGameStats,
} from "tachi-common";

export type PBDataset<GPT extends GPTString = GPTString> = ({
	__playcount?: integer;
	__related: {
		chart: ChartDocument<GPT>;
		index: integer;
		song: SongDocument<GPTStringToGame[GPT]>;
		user?: UserDocument;
	};
} & PBScoreDocument<GPT>)[];

export type ScoreDataset<GPT extends GPTString = GPTString> = ({
	__related: {
		chart: ChartDocument<GPT>;
		index: integer;
		song: SongDocument<GPTStringToGame[GPT]>;
		user: UserDocument;
	};
} & ScoreDocument<GPT>)[];

export type FolderDataset<GPT extends GPTString = GPTString> = ({
	__related: {
		pb: PBScoreDocument<GPT> | null;
		song: SongDocument<GPTStringToGame[GPT]>;
		user: UserDocument;
	};
} & ChartDocument<GPT>)[];

export type ChartLeaderboardDataset<GPT extends GPTString = GPTString> = ({
	__related: {
		user: UserDocument;
	};
} & PBScoreDocument<GPT>)[];

export type UGSDataset = ({
	__related: {
		index: integer;
		user: UserDocument;
	};
} & UserGameStats)[];

export type RivalChartDataset<GPT extends GPTString = GPTString> = ({
	__related: {
		index: number;
		pb: PBScoreDocument<GPT> | null;
	};
} & UserDocument)[];

export type ComparePBsDataset<GPT extends GPTString = GPTString> = Array<{
	base: PBScoreDocument<GPT> | null;
	chart: ChartDocument;
	compare: PBScoreDocument<GPT> | null;
	song: SongDocument;
}>;

export type ImportDataset = Array<
	{
		__related: {
			user: UserDocument;
		};
	} & ImportDocument
>;

export type FailedImportDataset = Array<
	{
		__related: {
			user: UserDocument;
		};
	} & ImportTrackerFailed
>;

export type GoalSubDataset = ({
	__related: {
		goal: GoalDocument;
		parentQuests: Array<QuestDocument>;
		user: UserDocument;
	};
} & GoalSubscriptionDocument)[];
