import type { IObjectID } from "monk";
import type { integer } from "tachi-common";

import { log } from "#lib/log/log.js";
import db from "#services/mongo/db";
import { WrapScriptPromise } from "#utils/misc";

async function DedupeScoreIDs() {
	const dups: Array<{ count: integer; dups: Array<IObjectID>; id: string }> =
		await db.scores.aggregate(
			[
				{
					$group: {
						_id: "$scoreID",
						dups: { $addToSet: "$_id" },
						count: { $sum: 1 },
					},
				},
				{
					$match: {
						count: { $gt: 1 },
					},
				},
			],
			{ allowDiskUse: true },
		);

	log.info(`Found ${dups.length} dups.`);

	for (const dup of dups) {
		dup.dups.shift();
		// eslint-disable-next-line no-await-in-loop
		await db.scores.remove({ _id: { $in: dup.dups } });
	}
}

if (require.main === module) {
	WrapScriptPromise(DedupeScoreIDs(), log);
}
