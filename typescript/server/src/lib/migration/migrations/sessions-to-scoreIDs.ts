import type { Migration } from "#utils/types";
import type { SessionDocument } from "../../../../../common/src";

import db from "#external/mongo/db";
import { EfficientDBIterate } from "#utils/efficient-db-iterate";

const migration: Migration = {
	id: "sessions-to-scoreIDs",
	up: async () => {
		await EfficientDBIterate(
			db.sessions,
			(s: any) => {
				// this is completely unsafe but i don't care

				s.scoreIDs = s.scoreInfo.map((e: any) => e.scoreID);

				return s as SessionDocument;
			},
			async (updates: Array<SessionDocument>) => {
				await db.sessions.bulkWrite(
					updates.map((e) => ({
						updateOne: {
							filter: {
								sessionID: e.sessionID,
							},
							update: {
								$set: {
									scoreIDs: e.scoreIDs,
								},
								$unset: {
									scoreInfo: 1,
								},
							},
						},
					})),
				);
			},
			{ scoreIDs: { $exists: false } },
		);
	},
	down: () => {
		throw new Error(`Reverting this change is not possible.`);
	},
};

export default migration;
