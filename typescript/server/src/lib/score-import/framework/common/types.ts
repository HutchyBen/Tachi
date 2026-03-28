import type { Mutable } from "#utils/types";
import type {
	ConfProvidedMetrics,
	GPTString,
	integer,
	Judgements,
	MongoOptionalMetrics,
	Playtype,
	ScoreDocument,
} from "tachi-common";
import type { MongoExtractMetrics } from "tachi-common/types/metrics";

/**
 * ScoreData, but it's just the provided metrics (and enumIndexes don't exist).
 */
export type DryScoreData<GPT extends GPTString> = {
	judgements: Partial<Record<Judgements[GPT], integer | null>>;
	optional: Mutable<MongoOptionalMetrics[GPT]>;
} & MongoExtractMetrics<ConfProvidedMetrics[GPT]>;

/**
 * An intermediate score format that will be fully filled out by
 * HydrateScore.
 */
export type DryScore<GPT extends GPTString = GPTString> = {
	scoreData: DryScoreData<GPT>;
} & Pick<
	ScoreDocument<GPT>,
	"comment" | "game" | "importType" | "scoreMeta" | "service" | "timeAchieved"
>;

export type ScorePlaytypeMap = Partial<Record<Playtype, Array<ScoreDocument>>>;
export type ChartIDPlaytypeMap = Partial<Record<Playtype, Set<string>>>;
