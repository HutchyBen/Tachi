import type { GameGroup, integer, Playtype } from "tachi-common";
import { GamePTToV3 } from "tachi-common";

import { log } from "#lib/log/log";
import DB from "#services/pg/db";

/**
 * Create GameSettings for a UGPT (which contains their preferences).
 */
export async function CreateGameSettings(userID: integer, game: GameGroup, playtype: Playtype) {
	const v3Game = GamePTToV3(game, playtype);

	const exists = await DB.selectFrom("game_settings")
		.select("user_id")
		.where("user_id", "=", userID)
		.where("game", "=", v3Game)
		.executeTakeFirst();

	if (exists) {
		log.error(
			`Cannot create ${userID} ${game} ${playtype} game-settings as one already exists?`,
		);

		throw new Error(
			`Cannot create ${userID} ${game} ${playtype} game-settings as one already exists?`,
		);
	}

	const gameSpecific =
		game === "iidx"
			? {
					display2DXTra: false,
					bpiTarget: 0,
				}
			: {};

	await DB.insertInto("game_settings")
		.values({
			data: JSON.stringify(gameSpecific),
			game: v3Game,
			pf_default_table: null,
			pf_preferred_default_enum: null,
			pf_preferred_profile_alg: null,
			pf_preferred_ranking: null,
			pf_preferred_score_alg: null,
			pf_preferred_session_alg: null,
			user_id: userID,
		})
		.execute();

	log.info(`Created game settings for ${userID} (${game} ${playtype}).`);
}
