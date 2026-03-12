import type { Migration } from "#utils/types";

import db from "#services/mongo/db";
import { EfficientDBIterate } from "#utils/efficient-db-iterate";

import type { SessionDocument } from "../../../../../common/src";

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
