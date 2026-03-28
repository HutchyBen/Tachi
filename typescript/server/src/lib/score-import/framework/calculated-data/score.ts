import { GPT_SERVER_IMPLEMENTATIONS } from "#game-implementations/game-implementations";
import {
	type GameGroup,
	GetGPTString,
	type GPTString,
	type MONGO_ChartDocument,
	type MONGO_ScoreData,
	type MongoDerivedMetrics,
} from "tachi-common";

import type { DryScoreData } from "../common/types";

/**
 * Create calculated data for a score.
 * @param scores - All of the scores in this session.
 */
export function CreateScoreCalcData<GPT extends GPTString>(
	game: GameGroup,
	scoreData: DryScoreData<GPT> | MONGO_ScoreData<GPT>,
	chart: MONGO_ChartDocument<GPT>,
) {
	const gptString = GetGPTString(game, chart.playtype);
	const impl = GPT_SERVER_IMPLEMENTATIONS[gptString];

	// Union of per-GPT `scoreDeriver` signatures is not callable with generic `GPT`.

	const derivedData = impl.scoreDeriver(
		scoreData as any,
		chart as any,
	) as MongoDerivedMetrics[GPT];

	// Per-GPT `scoreCalcs` take game-specific score/derived types; at runtime inputs match `gptString`.
	const scoreCalcs = impl.scoreCalcs as unknown as (
		scoreData: MONGO_ScoreData<GPT>,
		derivedData: MongoDerivedMetrics[GPT],
		chart: MONGO_ChartDocument<GPT>,
	) => Record<string, number | null>;

	return scoreCalcs(scoreData as MONGO_ScoreData<GPT>, derivedData, chart);
}
