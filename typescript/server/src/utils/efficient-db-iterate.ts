import type { ICollection, IObjectID } from "monk";

/* eslint-disable no-await-in-loop */
import { log } from "#lib/log/log";

export async function EfficientDBIterate<T extends object, R>(
	collection: ICollection<T>,
	callbackFn: (c: T) => Promise<R> | R,
	saveOp: (c: Array<R>) => Promise<void>,
	filter: object = {},
	bucketSize = 10_000,
) {
	let i = 0;

	let lastID: IObjectID | null = null;

	while (true) {
		log.info(`Running on ${i} - ${i + bucketSize} documents.`);

		const newFilter: any = { ...filter };

		if (lastID) {
			newFilter._id = { $gt: lastID };
		}

		const docs = await collection.find(newFilter, {
			sort: { _id: 1 },
			limit: bucketSize,
			projectID: true,
		});

		// update lastID by taking the last document's ID.
		lastID = docs.at(-1)?._id ?? null;

		if (docs.length === 0) {
			log.info(`Ended documents at ${i}.`);
			break;
		}

		const rDocs = await Promise.all(docs.map(callbackFn));

		i = i + bucketSize;

		await saveOp(rDocs);
	}
}
