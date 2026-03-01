/**
 * Prints the document count for every collection in a MongoDB database.
 *
 * Run with:
 *   cd server && MONGO_URL=mongodb://mongo/tachi ts-node -r tsconfig-paths/register src/scripts/mongo-count-collections.ts
 */

import monk from "monk";

const MONGO_URL = process.env.MONGO_URL ?? "mongodb://mongo/tachi";

const db = monk(MONGO_URL);

async function main(): Promise<void> {
	await db.then(() => void 0);

	// Access the underlying native MongoDB db object to list collections.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-imports
	const nativeDb = (db as any)._db as import("mongodb").Db;

	const collections = await nativeDb.listCollections().toArray();
	const names = collections.map((c) => c.name).sort((a, b) => a.localeCompare(b));

	const rows: Array<{ collection: string; count: number }> = [];

	for (const name of names) {
		// eslint-disable-next-line no-await-in-loop
		const count = await nativeDb.collection(name).countDocuments();

		rows.push({ collection: name, count });
	}

	rows.sort((a, b) => b.count - a.count);

	const maxLen = Math.max(...rows.map((r) => r.collection.length));

	console.log(`\n${"Collection".padEnd(maxLen)}  Count`);
	console.log(`${"-".repeat(maxLen)}  -----`);

	for (const { collection, count } of rows) {
		console.log(`${collection.padEnd(maxLen)}  ${count.toLocaleString()}`);
	}
}

main()
	.catch((err: unknown) => {
		console.error(err);
		process.exit(1);
	})
	.finally(async () => {
		await db.close();
	});
