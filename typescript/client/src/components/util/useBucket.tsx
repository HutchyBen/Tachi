import { type GameGroup, GetGamePTConfig, type Playtype } from "tachi-common";

import useLUGPTSettings from "./useLUGPTSettings";

export function useBucket(game: GameGroup, playtype: Playtype) {
	const { settings } = useLUGPTSettings();

	if (!settings?.preferences.preferredDefaultEnum) {
		const gptConfig = GetGamePTConfig(game, playtype);

		return gptConfig.preferredDefaultEnum;
	}

	return settings.preferences.preferredDefaultEnum;
}
