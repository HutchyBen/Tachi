/* eslint-disable no-await-in-loop */

import { log } from "#lib/logger/log.js";
import { UpdateUsersGamePlaytypeStats } from "#lib/score-import/framework/ugpt-stats/update-ugpt-stats";
import db from "#services/mongo/db";
import { FormatUserDoc } from "#utils/user";

export async function RecalcGameProfiles(filter = {}) {
	const profiles = await db["game-stats"].find(filter);

	for (const profile of profiles) {
		const user = await db.users.findOne({
			id: profile.userID,
		});

		if (!user) {
			log.error(`User ${profile.userID} does not exist?`);
			throw new Error(`User ${profile.userID} does not exist.`);
		}

		log.verbose(
			`Recalcing ${FormatUserDoc(user)}'s ${profile.game} ${profile.playtype} stats.`,
		);
		await UpdateUsersGamePlaytypeStats(
			profile.game,
			profile.playtype,
			profile.userID,
			null,
			logger,
		);
	}

	log.info(`Done.`);
}
