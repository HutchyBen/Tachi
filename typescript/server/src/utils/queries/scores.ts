import type { GameGroup, integer, Playtype } from "tachi-common";

import MONGODB_KILL from "#services/mongo/db";

export async function GetRecentUGPTScores(
	userID: integer,
	game: GameGroup,
	playtype: Playtype,
	limit = 100,
) {
	return MONGODB_KILL.scores.find(
		{
			userID,
			game,
			playtype,
		},
		{
			sort: {
				timeAdded: -1,
			},
			limit,
		},
	);
}

export async function GetRecentUGPTHighlights(
	userID: integer,
	game: GameGroup,
	playtype: Playtype,
	limit = 100,
) {
	return MONGODB_KILL.scores.find(
		{
			userID,
			game,
			playtype,
			highlight: true,
		},
		{
			sort: {
				timeAdded: -1,
			},
			limit,
		},
	);
}
