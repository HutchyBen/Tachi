/* eslint-disable no-await-in-loop */

import { log } from "#lib/log/log.js";
import { CreateSessionCalcData } from "#lib/score-import/framework/calculated-data/session";
import MONGODB_KILL from "#services/mongo/db";
import { GetGPTString } from "tachi-common";

export async function RecalcSessions(filter = {}) {
	const allSessions = await MONGODB_KILL.sessions.find(filter);

	log.info(`Recalcing ${allSessions.length} sessions.`);

	for (const session of allSessions) {
		const scores = await MONGODB_KILL.scores.find(
			{ scoreID: { $in: session.scoreIDs } },
			{
				projection: { calculatedData: 1 },
			},
		);

		if (scores.length === 0) {
			await MONGODB_KILL.sessions.remove({ sessionID: session.sessionID });
			continue;
		}

		let c;

		try {
			c = CreateSessionCalcData(GetGPTString(session.game, session.playtype), scores);
		} catch (err) {
			log.error({ err }, `Recalcing ${session.game} (${session.playtype}) failed.`);
			log.warn(`Destroying session!`);
			await MONGODB_KILL.sessions.remove({ sessionID: session.sessionID });
			continue;
		}

		await MONGODB_KILL.sessions.update(
			{ sessionID: session.sessionID },
			{ $set: { calculatedData: c } },
		);
	}

	log.info(`Done!`);
}
