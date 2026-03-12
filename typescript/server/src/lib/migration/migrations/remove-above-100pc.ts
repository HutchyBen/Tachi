import type { Migration } from "#utils/types";

import { DeleteMultipleScores } from "#lib/score-mutation/delete-scores";
import db from "#services/mongo/db";

const migration: Migration = {
	id: "remove-above-100pc",
	up: async () => {
		const toDelete = await db.scores.find({
			game: "bms",
			"scoreData.percent": { $gt: 100.0 },
		});

		await DeleteMultipleScores(toDelete);
	},
	down: () => {
		throw new Error(`Reverting this change is not possible.`);
	},
};

export default migration;
