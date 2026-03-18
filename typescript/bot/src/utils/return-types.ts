import type {
	APIPermissions,
	ChartDocument,
	GPTString,
	ImportDocument,
	integer,
	ProfileRatingAlgorithms,
	ScoreDocument,
	SongDocument,
	UserGameStats,
} from "tachi-common";

export interface ServerStatus {
	serverTime: number;
	startTime: number;
	version: string;
	whoami: integer | null;
	permissions: Array<APIPermissions>;
}

export interface ImportDeferred {
	url: string;
	importID: string;
}

export type ImportPollStatus =
	| {
			import: ImportDocument;
			importStatus: "completed";
	  }
	| {
			importStatus: "ongoing";
			progress: {
				description: string;
				value: integer;
			};
	  };

export interface UGPTStats<GPT extends GPTString = GPTString> {
	gameStats: UserGameStats;
	firstScore: ScoreDocument;
	mostRecentScore: ScoreDocument;
	totalScores: integer;
	rankingData: Record<ProfileRatingAlgorithms[GPT], { outOf: integer; ranking: integer }>;
}

export interface ChartQueryReturns {
	charts: Array<{ __playcount: integer } & ChartDocument>;
	songs: Array<SongDocument>;
}
