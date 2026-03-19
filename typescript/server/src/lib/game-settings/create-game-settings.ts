import type { GameGroup, integer, Playtype } from "tachi-common";

import { log } from "#lib/log/log.js";
import MONGODB_KILL from "#services/mongo/db";

/**
 * Create GameSettings for a UGPT (which contains their preferences).
 */
export async function CreateGameSettings(userID: integer, game: GameGroup, playtype: Playtype) {
	const exists = await MONGODB_KILL["game-settings"].findOne({
		userID,
		game,
		playtype,
	});

	if (exists) {
		log.error(
			`Cannot create ${userID} ${game} ${playtype} game-settings as one already exists?`,
		);

		throw new Error(
			`Cannot create ${userID} ${game} ${playtype} game-settings as one already exists?`,
		);
	}

	let gameSpecific = {};

	if (game === "iidx") {
		gameSpecific = {
			display2DXTra: false,
			bpiTarget: 0,
		};
	}

	await MONGODB_KILL["game-settings"].insert({
		userID,
		game,
		playtype,
		preferences: {
			preferredProfileAlg: null,
			preferredSessionAlg: null,
			preferredScoreAlg: null,
			preferredDefaultEnum: null,
			defaultTable: null,
			preferredRanking: null,
			stats: [],
			gameSpecific,
		},
		rivals: [],
	});

	log.info(`Created game settings for ${userID} (${game} ${playtype}).`);
}
