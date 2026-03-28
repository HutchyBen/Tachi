import { UGPTContext } from "#context/UGPTContext";
import { useContext } from "react";
import { type GPTString, type MONGO_UGPTSettingsDocument } from "tachi-common";

export default function useLUGPTSettings<GPT extends GPTString>() {
	const { loggedInData, setLoggedInData } = useContext(UGPTContext);

	const settings = (loggedInData?.settings ?? null) as MONGO_UGPTSettingsDocument<GPT> | null;

	const setSettings = (newSettings: MONGO_UGPTSettingsDocument<GPT>) => {
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
