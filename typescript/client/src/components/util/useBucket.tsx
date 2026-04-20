import { GetGameConfig, type V3Game } from "tachi-common";

import useLUGPTSettings from "./useLUGPTSettings";

export function useBucket(game: V3Game) {
	const { settings } = useLUGPTSettings();

	if (!settings?.preferences.preferredDefaultEnum) {
		const gameConfig = GetGameConfig(game);

		return gameConfig.preferredDefaultEnum;
	}

	return settings.preferences.preferredDefaultEnum;
}
