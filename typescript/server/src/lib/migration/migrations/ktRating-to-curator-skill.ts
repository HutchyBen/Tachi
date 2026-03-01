import type { Migration } from "#utils/types";

import { RecalcAllScores } from "#utils/calculations/recalc-scores";

const migration: Migration = {
	id: "ktRating-to-curator-skill",
	up: async () => {
		await RecalcAllScores({ game: "museca" });
	},
	down: () => {
		throw new Error(`Not possible to revert.`);
	},
};

export default migration;
