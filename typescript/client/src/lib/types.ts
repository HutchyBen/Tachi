import { type Header } from "#components/tables/components/TachiTable";
import { type CSSProperties } from "react";
import {
	type ClassConfigs,
	type ConfScoreMetrics,
	type Difficulties,
	type GPTString,
	type integer,
	type MONGO_ChartDocument,
	type MONGO_PBScoreDocument,
	type MONGO_ScoreDocument,
	type ScoreRatingAlgorithms,
} from "tachi-common";
import { type ExtractEnumMetricNames, type GetEnumValue } from "tachi-common/types/metrics";

export type GPTEnumColours<GPT extends GPTString> = {
	// @ts-expect-error this is fine please do not worry
	[M in ExtractEnumMetricNames<ConfScoreMetrics[GPT]>]: Record<GetEnumValue<GPT, M>, string>;
};

export type GPTEnumIcons<GPT extends GPTString> = {
	[M in ExtractEnumMetricNames<ConfScoreMetrics[GPT]>]: string;
};

export type GPTDifficultyColours<GPT extends GPTString> = Record<Difficulties[GPT], string>;

/**
 * Every GPT has to have some sort of "rating system" for charts defined.
 * The UI uses this to handle things like sorting on the difficulty cell.
 */
export type GPTRatingSystem<GPT extends GPTString> = {
	/**
	 * What qualifies as "achieving" the band in this rating system?
	 * For example, a clear tierlist would use this to discriminate clears
	 * from non-clears.
	 *
	 * Returns a two-tuple. The first is the value that should be displayed to the
	 * end user (i.e. the string lamp when the target is hard clear)
	 * the second is whether they achieved this or not.
	 */
	achievementFn?: (
		p: MONGO_PBScoreDocument<GPT> | MONGO_ScoreDocument<GPT>,
	) => [number | string, boolean];
	description: string;
	enumName: string;

	/**
	 * Does this rating system say this chart has strong individual differences
	 * between players?
	 */
	idvDifference: (c: MONGO_ChartDocument<GPT>) => boolean | null | undefined;
	name: string;

	toNumber: (c: MONGO_ChartDocument<GPT>) => number | null | undefined;

	toString: (c: MONGO_ChartDocument<GPT>) => string | null | undefined;
};

export type GPTClassColours<GPT extends GPTString> = {
	[C in keyof ClassConfigs[GPT]]: {
		// @ts-expect-error it's kinda cool how TS lets me just uhh
		// ignore, errors
		// in the abhorrent stringly based typesystem i have created.
		// Whatever! This works.

		// string => bootstrap variant
		// css properties => css
		// null -> no styling
		[V in ClassConfigs[GPT][C]["values"][number]["id"]]:
			| "danger"
			| "info"
			| "primary"
			| "secondary"
			| "success"
			| "warning"
			| CSSProperties
			| null;
	};
};

export interface GPTClientImplementation<GPT extends GPTString = GPTString> {
	enumColours: GPTEnumColours<GPT>;

	/**
	 * Fontawesome Icons to use next to enum names.
	 */
	enumIcons: GPTEnumIcons<GPT>;

	difficultyColours: GPTDifficultyColours<GPT>;
	classColours: GPTClassColours<GPT>;

	/**
	 * Other than chart.level and chart.levelNum, what other rating systems exist
	 * for this game?
	 *
	 * You can use this to add things like tierlists (chart.data.ncTier, hcTier, etc.)
	 */
	ratingSystems: Array<GPTRatingSystem<GPT>>;

	/**
	 * Can be used to replace the display name of the algorithm.
	 * (Which defaults to `UppercaseFirst(key)`)
	 * This is particularly useful for renaming old algorithms.
	 */
	ratingAlgNameOverrides?: {
		profile?: Record<string, string>;
		score?: Record<string, string>;
		session?: Record<string, string>;
	};

	/**
	 * What headers should be used when rendering scores in a table for this game?
	 */
	scoreHeaders: Array<Header<MONGO_PBScoreDocument<GPT> | MONGO_ScoreDocument<GPT>>>;

	/**
	 * How should we render the "core cells" for a score row in this game?
	 *
	 * This should render exactly the same amount of cells as there are headers.
	 */
	scoreCoreCells: (props: {
		chart: MONGO_ChartDocument<GPT>;
		sc: MONGO_PBScoreDocument<GPT> | MONGO_ScoreDocument<GPT>;
	}) => JSX.Element;

	/**
	 * How should we render the "rating cell" for a score row in this game?
	 *
	 * This is separate from the core cells as not all views in the client want to
	 * necessarily display all four cells at once.
	 *
	 * You can use this to stylise certain things about your game's rating system, like
	 * colouring in jubility with the appropriate colour, or indicating why a user
	 * got 0 points on an unranked chart, etc..
	 */
	ratingCell: (props: {
		chart: MONGO_ChartDocument<GPT>;
		rating: ScoreRatingAlgorithms[GPT];
		sc: MONGO_PBScoreDocument<GPT> | MONGO_ScoreDocument<GPT>;
	}) => JSX.Element;

	/**
	 * How many scores should we consider for the topX in the session important scores
	 * display?
	 */
	sessionImportantScoreCount: integer;
}
