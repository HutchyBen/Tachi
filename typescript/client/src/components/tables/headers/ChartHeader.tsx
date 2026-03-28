import { GPT_CLIENT_IMPLEMENTATIONS } from "#lib/game-implementations";
import { type GPTRatingSystem } from "#lib/types";
import { IsNullish } from "#util/misc";
import { type GameGroup, GetGPTString, type MONGO_ChartDocument } from "tachi-common";

import { type Header } from "../components/TachiTable";

export function CascadingRatingValue(
	game: GameGroup,
	chartA: MONGO_ChartDocument,
	chartB: MONGO_ChartDocument,
) {
	const gptImpl = GPT_CLIENT_IMPLEMENTATIONS[GetGPTString(game, chartA.playtype)];

	if (chartA.levelNum !== chartB.levelNum) {
		return chartA.levelNum - chartB.levelNum;
	}

	for (const rating of gptImpl.ratingSystems as GPTRatingSystem<any>[]) {
		const a = rating.toNumber(chartA);
		const b = rating.toNumber(chartB);
		if (a !== b) {
			if (IsNullish(a)) {
				return -Infinity;
			} else if (IsNullish(b)) {
				return Infinity;
			}

			return a! - b!;
		}
	}

	// these things are equal on all counts
	return 0;
}

export default function ChartHeader<D>(
	game: GameGroup,
	chartGetter: (k: D) => MONGO_ChartDocument,
): Header<D> {
	return ["Chart", "Chart", (a, b) => CascadingRatingValue(game, chartGetter(a), chartGetter(b))];
}
