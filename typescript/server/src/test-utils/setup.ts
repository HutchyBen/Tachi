import { monkDB } from "#services/mongo/db";

import { SetIndexesForDB } from "./resets";

SetIndexesForDB()
	.then(monkDB.close)
	.then(() => process.exit(0))
	.catch((err) => {
		// we might not *have* a workinglog here

		console.error(err);
		process.exit(1);
	});
