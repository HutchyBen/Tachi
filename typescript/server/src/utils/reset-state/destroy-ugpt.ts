import type { GameGroup, integer, Playtype } from "tachi-common";

import MONGODB_KILL from "#services/mongo/db";
import { UpdateAllPBs } from "#utils/calculations/recalc-scores";

/**
 * Completely resets a UGPT profile.
 *
 * This function is dangerous! Should only be ran by admins.
 */
export default async function DestroyUserGamePlaytypeData(
	userID: integer,
	game: GameGroup,
	playtype: Playtype,
) {
	await MONGODB_KILL["game-stats-snapshots"].remove({
		userID,
		game,
		playtype,
	});

	await MONGODB_KILL.scores.remove({
		userID,
		game,
		playtype,
	});

	const chartIDs = (
		await MONGODB_KILL["personal-bests"].find(
			{
				userID,
				game,
				playtype,
			},
			{
				projection: {
					chartID: 1,
				},
			},
		)
	).map((e) => e.chartID);

	await MONGODB_KILL["personal-bests"].remove({
		userID,
		game,
		playtype,
	});

	await UpdateAllPBs(undefined, {
		chartID: { $in: chartIDs },
	});

	await MONGODB_KILL.sessions.remove({
		userID,
		game,
		playtype,
	});

	await MONGODB_KILL.imports.remove({
		userID,
		game,
		playtype,
	});

	await MONGODB_KILL["game-settings"].remove({
		userID,
		game,
		playtype,
	});

	await MONGODB_KILL["game-stats"].remove({
		userID,
		game,
		playtype,
	});
}
