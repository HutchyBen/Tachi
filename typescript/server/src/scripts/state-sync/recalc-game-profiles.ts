import type { GameGroup, MONGO_ScoreDocument, Playtype } from "tachi-common";

import { log } from "#lib/log/log";
import { UpdateUsersGamePlaytypeStats } from "#lib/score-import/framework/ugpt-stats/update-ugpt-stats";
/* eslint-disable no-await-in-loop */
import MONGODB_KILL from "#services/mongo/db";
import { WrapScriptPromise } from "#utils/misc";
import { FormatUserDoc } from "#utils/user";

export async function RecalcGameProfiles() {
	const users = await MONGODB_KILL.users.find({});

	for (const user of users) {
		const gpts: Array<{ _id: { game: GameGroup; playtype: Playtype } } & MONGO_ScoreDocument> =
			await MONGODB_KILL.scores.aggregate([
				{
					$match: {
						userID: user.id,
					},
				},
				{
					$group: {
						_id: {
							game: "$game",
							playtype: "$playtype",
						},
					},
				},
			]);

		log.info(`Found ${gpts.length} GPTs for ${FormatUserDoc(user)}`);

		for (const gpt of gpts) {
			const { game, playtype } = gpt._id;

			log.info(`Updating ${FormatUserDoc(user)}'s ${game} ${playtype} stats.`);
			await UpdateUsersGamePlaytypeStats(game, playtype, user.id, null, log);
		}
	}

	log.info(`Done.`);
}

if (require.main === module) {
	WrapScriptPromise(RecalcGameProfiles(), log);
}
