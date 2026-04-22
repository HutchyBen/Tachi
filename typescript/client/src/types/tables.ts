import {
	type ChartDocument,
	type GameGroup,
	type GoalDocument,
	type GoalSubscriptionDocument,
	type ImportDocument,
	type ImportTrackerFailed,
	type integer,
	type PBScoreDocument,
	type QuestDocument,
	type ScoreDocument,
	type SongDocument,
	type UserDocument,
	type UserGameStatsWithProfileLeaderboardRank,
	type V3Game,
} from "tachi-common";

export type PBDataset<GPT extends V3Game = V3Game> = ({
	__playcount?: integer;
	__related: {
		chart: ChartDocument<GPT>;
		index: integer;
		song: SongDocument<GameGroup>;
		user?: UserDocument;
	};
} & PBScoreDocument<GPT>)[];

export type ScoreDataset<GPT extends V3Game = V3Game> = ({
	__related: {
		chart: ChartDocument<GPT>;
		index: integer;
		song: SongDocument<GameGroup>;
		user: UserDocument;
	};
} & ScoreDocument<GPT>)[];

export type FolderDataset<GPT extends V3Game = V3Game> = ({
	__related: {
		pb: PBScoreDocument<GPT> | null;
		song: SongDocument<GameGroup>;
		user: UserDocument;
	};
} & ChartDocument<GPT>)[];

export type ChartLeaderboardDataset<GPT extends V3Game = V3Game> = ({
	__related: {
		user: UserDocument;
	};
} & PBScoreDocument<GPT>)[];

export type UGSDataset = ({
	__related: {
		index: integer;
		user: UserDocument;
	};
} & UserGameStatsWithProfileLeaderboardRank)[];

export type RivalChartDataset<GPT extends V3Game = V3Game> = ({
	__related: {
		index: number;
		pb: PBScoreDocument<GPT> | null;
	};
} & UserDocument)[];

export type ComparePBsDataset<GPT extends V3Game = V3Game> = Array<{
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
