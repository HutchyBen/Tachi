import type {
	APIPermissions,
	GPTString,
	integer,
	MONGO_ChartDocument,
	MONGO_ImportDocument,
	MONGO_ScoreDocument,
	MONGO_SongDocument,
	MONGO_UserGameStats,
	ProfileRatingAlgorithms,
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
			import: MONGO_ImportDocument;
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
	gameStats: MONGO_UserGameStats;
	firstScore: MONGO_ScoreDocument;
	mostRecentScore: MONGO_ScoreDocument;
	totalScores: integer;
	rankingData: Record<ProfileRatingAlgorithms[GPT], { outOf: integer; ranking: integer }>;
}

export interface ChartQueryReturns {
	charts: Array<{ __playcount: integer } & MONGO_ChartDocument>;
	songs: Array<MONGO_SongDocument>;
}
