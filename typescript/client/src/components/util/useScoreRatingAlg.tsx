import {
	GetGameConfig,
	type ProfileRatingAlgorithms,
	type ScoreRatingAlgorithms,
	type SessionRatingAlgorithms,
	type V3Game,
} from "tachi-common";

import useLUGPTSettings from "./useLUGPTSettings";

export default function useScoreRatingAlg<GPT extends V3Game = V3Game>(
	game: GPT,
): ScoreRatingAlgorithms[GPT] {
	const { settings } = useLUGPTSettings();

	if (!settings?.preferences.preferredScoreAlg) {
		const gameConfig = GetGameConfig(game);

		return gameConfig.defaultScoreRatingAlg as ScoreRatingAlgorithms[GPT];
	}

	return settings.preferences.preferredScoreAlg as ScoreRatingAlgorithms[GPT];
}

export function useSessionRatingAlg<GPT extends V3Game = V3Game>(
	game: GPT,
): SessionRatingAlgorithms[GPT] {
	const { settings } = useLUGPTSettings();

	if (!settings?.preferences.preferredSessionAlg) {
		const gameConfig = GetGameConfig(game);

		return gameConfig.defaultSessionRatingAlg as SessionRatingAlgorithms[GPT];
	}

	return settings.preferences.preferredSessionAlg as SessionRatingAlgorithms[GPT];
}

export function useProfileRatingAlg<GPT extends V3Game = V3Game>(
	game: GPT,
): ProfileRatingAlgorithms[GPT] {
	const { settings } = useLUGPTSettings();

	if (!settings?.preferences.preferredProfileAlg) {
		const gameConfig = GetGameConfig(game);

		return gameConfig.defaultProfileRatingAlg as ProfileRatingAlgorithms[GPT];
	}

	return settings.preferences.preferredProfileAlg as ProfileRatingAlgorithms[GPT];
}
