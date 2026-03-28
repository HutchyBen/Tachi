import { type SetState } from "#types/react";
import { APIFetchV1 } from "#util/api";
import { type MONGO_UserGameStats } from "tachi-common";

export default async function UpdateUserGameStats(setUGS: SetState<MONGO_UserGameStats[] | null>) {
	const res = await APIFetchV1<MONGO_UserGameStats[]>("/users/me/game-stats");

	if (!res.success) {
		setUGS(null);
		return;
	}

	setUGS(res.body);
}
