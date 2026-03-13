/* eslint-disable no-await-in-loop */

import { log } from "#lib/logger/log.js";
import { CreateSessionCalcData } from "#lib/score-import/framework/calculated-data/session";
import db from "#services/mongo/db";

import { GetGPTString } from "../../../../common/src";

export async function RecalcSessions(filter = {}) {
	const allSessions = await db.sessions.find(filter);

	log.info(`Recalcing ${allSessions.length} sessions.`);

	for (const session of allSessions) {
		const scores = await db.scores.find(
			{ scoreID: { $in: session.scoreIDs } },
			{
				projection: { calculatedData: 1 },
			},
		);

		if (scores.length === 0) {
			await db.sessions.remove({ sessionID: session.sessionID });
			continue;
		}

		let c;

		try {
			c = CreateSessionCalcData(GetGPTString(session.game, session.playtype), scores);
		} catch (err) {
			log.error(`Recalcing ${session.game} (${session.playtype}) failed.`, { err });
			log.warn(`Destroying session!`);
			await db.sessions.remove({ sessionID: session.sessionID });
			continue;
		}

		await db.sessions.update({ sessionID: session.sessionID }, { $set: { calculatedData: c } });
	}

	log.info(`Done!`);
}
