import CreateLogCtx from "#lib/logger/logger";
import { UpdateUsersGamePlaytypeStats } from "#lib/score-import/framework/ugpt-stats/update-ugpt-stats";

import type { GameGroup, Playtype, ScoreDocument } from "../../../../common/src";
/* eslint-disable no-await-in-loop */
import db from "#services/mongo/db";
import { WrapScriptPromise } from "#utils/misc";
import { FormatUserDoc } from "#utils/user";

const logger = CreateLogCtx(__filename);

export async function RecalcGameProfiles() {
	const users = await db.users.find({});

	for (const user of users) {
		const gpts: Array<{ _id: { game: GameGroup; playtype: Playtype } } & ScoreDocument> =
			await db.scores.aggregate([
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

		logger.info(`Found ${gpts.length} GPTs for ${FormatUserDoc(user)}`);

		for (const gpt of gpts) {
			const { game, playtype } = gpt._id;

			logger.info(`Updating ${FormatUserDoc(user)}'s ${game} ${playtype} stats.`);
			await UpdateUsersGamePlaytypeStats(game, playtype, user.id, null, logger);
		}
	}

	logger.info(`Done.`);
}

if (require.main === module) {
	WrapScriptPromise(RecalcGameProfiles(), logger);
}
