import db from "#services/mongo/db";

import type { GameGroup, integer, Playtype } from "../../../../common/src";

export async function GetRecentUGPTScores(
	userID: integer,
	game: GameGroup,
	playtype: Playtype,
	limit = 100,
) {
	return db.scores.find(
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
	return db.scores.find(
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
