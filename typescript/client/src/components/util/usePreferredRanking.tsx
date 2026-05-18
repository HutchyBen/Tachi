import { type UGPTSettingsDocument } from "tachi-common";

import useLUGPTSettings from "./useLUGPTSettings";

export default function usePreferredRanking():
	| UGPTSettingsDocument["preferences"]["preferredRanking"]
	| null {
	const { settings } = useLUGPTSettings();

	const raw = settings?.preferences.preferredRanking ?? null;
	// Rival ranking display is disabled; treat stored preference as global.
	return raw === "rival" ? "global" : raw;
}
