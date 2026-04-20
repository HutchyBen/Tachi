import useApiQuery from "#components/util/query/useApiQuery";
import { AllLUGPTStatsContext } from "#context/AllLUGPTStatsContext";
import { UserContext } from "#context/UserContext";
import { UserSettingsContext } from "#context/UserSettingsContext";
import { type SetState } from "#types/react";
import React, { useContext, useEffect } from "react";
import Nav from "react-bootstrap/Nav";
import { type UserGameStats } from "tachi-common";

import GlobalInfoDropdown from "./GlobalInfoDropdown";
import ImportScoresDropdown from "./ImportScoresDropdown";
import UGPTDropdown from "./UGPTDropdown";
import UtilsDropdown from "./UtilsDropdown";

const toggleClassNames = "w-100 justify-content-between";
const menuClassNames = "shadow-none shadow-lg-lg";

export function HeaderMenu({
	dropdownMenuStyle,
	setState,
}: {
	dropdownMenuStyle?: React.CSSProperties;
	setState?: SetState<boolean>;
}) {
	const { user } = useContext(UserContext);
	const { ugs, setUGS } = useContext(AllLUGPTStatsContext);
	const { settings } = useContext(UserSettingsContext);

	const { data, error } = useApiQuery<UserGameStats[]>(
		// We should generate a valid url just in case the skip somehow fails
		`/users/${user?.id ?? "me"}/game-stats`,
		undefined,
		undefined,
		// We should skip if a user isn't logged in.
		!user,
	);

	useEffect(() => {
		if (error) {
			console.error(error);
		}

		if (data) {
			setUGS(data);
		}
	}, [error, data]);

	return (
		<Nav as="nav" className="p-4 d-flex align-content-between gap-4 h-100">
			{user && ugs && ugs.length !== 0 && (
				<UGPTDropdown
					className={toggleClassNames}
					menuClassName={menuClassNames}
					setState={setState}
					style={dropdownMenuStyle}
					ugs={ugs}
					user={user}
				/>
			)}
			<GlobalInfoDropdown
				className={toggleClassNames}
				menuClassName={menuClassNames}
				setState={setState}
				style={dropdownMenuStyle}
			/>
			{user && (
				<ImportScoresDropdown
					className={toggleClassNames}
					menuClassName={menuClassNames}
					setState={setState}
					style={dropdownMenuStyle}
				/>
			)}
			{settings?.preferences.developerMode && (
				<UtilsDropdown
					className={toggleClassNames}
					menuClassName={menuClassNames}
					setState={setState}
					style={dropdownMenuStyle}
				/>
			)}
		</Nav>
	);
}
