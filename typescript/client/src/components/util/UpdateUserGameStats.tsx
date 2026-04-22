import { type SetState } from "#types/react";
import { APIFetchV1 } from "#util/api";
import { type UserGameStats } from "tachi-common";

export default async function UpdateUserGameStats(setUGS: SetState<UserGameStats[] | null>) {
	const res = await APIFetchV1<UserGameStats[]>("/users/me/game-profiles");

	if (!res.success) {
		setUGS(null);
		return;
	}

	setUGS(res.body);
}
