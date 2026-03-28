import { type JustChildren, type SetState } from "#types/react";
import { APIFetchV1 } from "#util/api";
import React, { createContext, useContext, useEffect, useState } from "react";
import { type MONGO_UserSettingsDocument } from "tachi-common";

import { UserContext } from "./UserContext";

/**
 * Contains the current user's settings.
 */
export const UserSettingsContext = createContext<{
	setSettings: SetState<MONGO_UserSettingsDocument | null>;
	settings: MONGO_UserSettingsDocument | null;
}>({ settings: null, setSettings: () => void 0 });

UserSettingsContext.displayName = "UserSettingsContext";

export function UserSettingsContextProvider({ children }: JustChildren) {
	const [settings, setSettings] = useState<MONGO_UserSettingsDocument | null>(null);

	const { user } = useContext(UserContext);

	useEffect(() => {
		if (!user) {
			return;
		}

		(async () => {
			const res = await APIFetchV1<MONGO_UserSettingsDocument>(`/users/${user.id}/settings`);

			if (res.success) {
				setSettings(res.body);
			}
		})();

		return () => {
			setSettings(null);
		};
	}, [user]);

	return (
		<UserSettingsContext.Provider value={{ settings, setSettings }}>
			{children}
		</UserSettingsContext.Provider>
	);
}
