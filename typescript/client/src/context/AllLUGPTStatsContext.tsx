import { type JustChildren, type SetState } from "#types/react";
import React, { createContext, useState } from "react";
import { type MONGO_UserGameStats } from "tachi-common";

/**
 * Contains all of the currently logged-in users GPTStats.
 *
 * Used to display things like the "your games" tab, and assorted
 * dashboard info.
 */
export const AllLUGPTStatsContext = createContext<{
	setUGS: SetState<MONGO_UserGameStats[] | null>;
	ugs: MONGO_UserGameStats[] | null;
}>({ ugs: null, setUGS: () => void 0 });
AllLUGPTStatsContext.displayName = "AllLUGPTStatsContext";

export function AllLUGPTStatsContextProvider({ children }: JustChildren) {
	const [ugs, setUGS] = useState<MONGO_UserGameStats[] | null>(null);

	return (
		<AllLUGPTStatsContext.Provider value={{ ugs, setUGS }}>
			{children}
		</AllLUGPTStatsContext.Provider>
	);
}
