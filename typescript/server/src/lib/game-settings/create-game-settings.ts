import CreateLogCtx from "#lib/logger/logger";
import db from "#services/mongo/db";

import type { GameGroup, integer, Playtype } from "../../../../common/src";

const logger = CreateLogCtx(__filename);

/**
 * Create GameSettings for a UGPT (which contains their preferences).
 */
export async function CreateGameSettings(userID: integer, game: GameGroup, playtype: Playtype) {
	const exists = await db["game-settings"].findOne({
		userID,
		game,
		playtype,
	});

	if (exists) {
		logger.error(
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

	await db["game-settings"].insert({
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

	logger.info(`Created game settings for ${userID} (${game} ${playtype}).`);
}
