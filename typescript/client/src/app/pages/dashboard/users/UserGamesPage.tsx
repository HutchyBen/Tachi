import useSetSubheader from "#components/layout/header/useSetSubheader";
import UGPTProfiles from "#components/user/UGPTProfiles";
import React from "react";
import { type MONGO_UserDocument } from "tachi-common";

export default function UserGamesPage({ reqUser }: { reqUser: MONGO_UserDocument }) {
	useSetSubheader(
		["Users", reqUser.username, "Games"],
		[reqUser],
		`${reqUser.username}'s Game Profiles`,
	);

	return <UGPTProfiles reqUser={reqUser} />;
}
