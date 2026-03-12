import type { Migration } from "#utils/types";

import db from "#services/mongo/db";

const migration: Migration = {
	id: "add-lockedat",
	up: async () => {
		await db["import-locks"].update(
			{},
			{
				$set: {
					lockedAt: null,
				},
			},
			{ multi: true },
		);
	},
	down: async () => {
		await db["import-locks"].update(
			{},
			{
				$unset: {
					lockedAt: 1,
				},
			},
			{ multi: true },
		);
	},
};

export default migration;
