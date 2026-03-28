import { type MONGO_UGPTSettingsDocument } from "tachi-common";

import useLUGPTSettings from "./useLUGPTSettings";

export default function usePreferredRanking():
	| MONGO_UGPTSettingsDocument["preferences"]["preferredRanking"]
	| null {
	const { settings } = useLUGPTSettings();

	return settings?.preferences.preferredRanking ?? null;
}
