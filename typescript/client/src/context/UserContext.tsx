import { type JustChildren, type SetState } from "#types/react";
import React, { createContext, useState } from "react";
import { type MONGO_UserDocument } from "tachi-common";

/**
 * Contains the current user's user document.
 */
export const UserContext = createContext<{
	setUser: SetState<MONGO_UserDocument | null>;
	user: MONGO_UserDocument | null;
}>({ user: null, setUser: () => void 0 });
UserContext.displayName = "UserContext";

export function UserContextProvider({ children }: JustChildren) {
	const [user, setUser] = useState<MONGO_UserDocument | null>(null);

	return <UserContext.Provider value={{ user, setUser }}>{children}</UserContext.Provider>;
}
