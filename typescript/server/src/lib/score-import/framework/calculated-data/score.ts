import { GPT_SERVER_IMPLEMENTATIONS } from "#game-implementations/game-implementations";
import {
	type ChartDocument,
	type GameGroup,
	GetGPTString,
	type GPTString,
} from "../../../../../../common/src";

import type { DryScoreData } from "../common/types";

/**
 * Create calculated data for a score.
 * @param scores - All of the scores in this session.
 */
export function CreateScoreCalcData<GPT extends GPTString>(
	game: GameGroup,
	dryScoreData: DryScoreData<GPT>,
	chart: ChartDocument<GPT>,
) {
	const gptString = GetGPTString(game, chart.playtype);

	const calcData: Record<string, number | null> = {};

	for (const [key, fn] of Object.entries(GPT_SERVER_IMPLEMENTATIONS[gptString].scoreCalcs)) {
		calcData[key] = fn(dryScoreData, chart);
	}

	return calcData;
}
