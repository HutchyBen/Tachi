import { UGPTContext } from "#context/UGPTContext";
import { useContext } from "react";
import { type UGPTSettingsDocument, type V3Game } from "tachi-common";

export default function useLUGPTSettings<GPT extends V3Game = V3Game>() {
	const { loggedInData, setLoggedInData } = useContext(UGPTContext);

	const settings = (loggedInData?.settings ?? null) as UGPTSettingsDocument<GPT> | null;

	const setSettings = (newSettings: UGPTSettingsDocument<GPT>) => {
		if (!loggedInData) {
			throw new Error(`Tried to set settings while nobody was logged in?`);
		}

		setLoggedInData({
			...loggedInData,
			settings: newSettings,
		});
	};

	return { settings, setSettings };
}
