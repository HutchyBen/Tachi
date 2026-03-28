import type { integer } from "../types";
import type {
	ConfOptionalMetrics,
	ConfProvidedMetrics,
	Difficulties,
	ExtractedClasses,
	GameGroup,
	GPTString,
	GPTStringToGame,
	GPTStringToPlaytype,
	Judgements,
	Playtype,
	ScoreMeta,
	Versions,
} from "./game-config";
import type { MongoExtractMetrics } from "./metrics";
import type { AllFieldsNullableOptional } from "./utils";

// These MatchTypes don't need `difficulty` set in the batch manual.
type MatchTypesNoDifficulty = "bmsChartHash" | "itgChartHash" | "popnChartHash" | "uscChartHash";

// These MatchTypes need `difficulty` set in the batch manual.
type MatchTypesWithDifficulty =
	| "ddrSongHash"
	| "inGameID"
	| "inGameStrID"
	| "sdvxInGameID"
	| "songTitle"
	| "tachiSongID";

export type MatchTypes = MatchTypesNoDifficulty | MatchTypesWithDifficulty;

interface MatchTypeBase {
	game: GameGroup;
	playtype: Playtype;
	version: Versions[GPTString] | null;
	identifier: string;
	artist?: string | null;
}

export type MatchTypeResolverWithDifficulty = {
	difficulty: string;
	matchType: MatchTypesWithDifficulty;
} & MatchTypeBase;

export type MatchTypeResolverNoDifficulty = {
	matchType: MatchTypesNoDifficulty;
} & MatchTypeBase;

export type MatchTypeResolver = MatchTypeResolverNoDifficulty | MatchTypeResolverWithDifficulty;

export type BatchManualScore<GPT extends GPTString = GPTString> = {
	artist?: string | null;
	comment?: string | null;
	/**
	 * @deprecated Use `optional` instead.
	 */
	hitMeta?: AllFieldsNullableOptional<MongoExtractMetrics<ConfOptionalMetrics[GPT]>>;
	identifier: string;
	judgements?: Record<Judgements[GPT], integer>;
	optional?: AllFieldsNullableOptional<MongoExtractMetrics<ConfOptionalMetrics[GPT]>>;

	scoreMeta?: Partial<ScoreMeta[GPT]>;
	timeAchieved?: number | null;
} & (
	| {
			difficulty: Difficulties[GPT];
			matchType: MatchTypesWithDifficulty;
	  }
	| {
			difficulty?: undefined; // hack to stop ts from screaming when this is accessed sometimes
			matchType: MatchTypesNoDifficulty;
	  }
) &
	MongoExtractMetrics<ConfProvidedMetrics[GPT]>;

export interface BatchManual<GPT extends GPTString = GPTString> {
	meta: {
		game: GPTStringToGame[GPT];
		playtype: GPTStringToPlaytype[GPT];
		service: string;
		version?: Versions[GPT];
	};
	scores: Array<BatchManualScore<GPT>>;
	classes?: ExtractedClasses[GPT] | null;
}
