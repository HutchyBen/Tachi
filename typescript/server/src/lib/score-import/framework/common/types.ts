import type { Mutable } from "#utils/types";
import type {
	ConfProvidedMetrics,
	GPTString,
	integer,
	Judgements,
	OptionalMetrics,
	Playtype,
	ScoreDocument,
} from "../../../../../../common/src";
import type { ExtractMetrics } from "../../../../../../common/src/types/metrics";

/**
 * ScoreData, but it's just the provided metrics (and enumIndexes don't exist).
 */
export type DryScoreData<GPT extends GPTString> = {
	judgements: Partial<Record<Judgements[GPT], integer | null>>;
	optional: Mutable<OptionalMetrics[GPT]>;
} & ExtractMetrics<ConfProvidedMetrics[GPT]>;

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
