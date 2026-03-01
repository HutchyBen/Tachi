import Navbar from "#components/nav/Navbar";
import { UserSettingsContext } from "#context/UserSettingsContext";
import React, { useContext } from "react";

export function GPTBottomNav({ baseUrl }: { baseUrl: string }) {
	const { settings } = useContext(UserSettingsContext);

	const navItems = [
		<Navbar.Item key="activity" to={`${baseUrl}/`}>
			Activity
		</Navbar.Item>,
		<Navbar.Item key="songs" to={`${baseUrl}/songs`}>
			Songs
		</Navbar.Item>,
		<Navbar.Item key="leaderboards" to={`${baseUrl}/leaderboards`}>
			Leaderboards
		</Navbar.Item>,
		<Navbar.Item
			key="quests"
			otherMatchingPaths={[`${baseUrl}/questline`]}
			to={`${baseUrl}/quests`}
		>
			Quests
		</Navbar.Item>,
	];

	if (settings?.preferences.developerMode) {
		navItems.push(
			<Navbar.Item key="dev-info" to={`${baseUrl}/dev-info`}>
				Developer Info
			</Navbar.Item>,
		);
	}

	return <Navbar>{navItems}</Navbar>;
}
