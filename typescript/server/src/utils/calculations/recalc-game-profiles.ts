/* eslint-disable no-await-in-loop */

import { log } from "#lib/log/log.js";
import { UpdateUsersGamePlaytypeStats } from "#lib/score-import/framework/ugpt-stats/update-ugpt-stats";
import MONGODB_KILL from "#services/mongo/db";
import { FormatUserDoc } from "#utils/user";

export async function RecalcGameProfiles(filter = {}) {
	const profiles = await MONGODB_KILL["game-stats"].find(filter);

	for (const profile of profiles) {
		const user = await MONGODB_KILL.users.findOne({
			id: profile.userID,
		});

		if (!user) {
			log.error(`User ${profile.userID} does not exist?`);
			throw new Error(`User ${profile.userID} does not exist.`);
		}

		log.debug(`Recalcing ${FormatUserDoc(user)}'s ${profile.game} ${profile.playtype} stats.`);
		await UpdateUsersGamePlaytypeStats(
			profile.game,
			profile.playtype,
			profile.userID,
			null,
			log,
		);
	}

	log.info(`Done.`);
}
