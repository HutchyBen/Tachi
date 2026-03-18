import { CloseScoreImportQueue } from "#lib/score-import/worker/queue";
import { CloseMongoConnection } from "#services/mongo/db";
import { CloseRedisConnection } from "#services/redis/redis";

import { CloseServerConnection } from "./mock-api";
import { WriteSnapshotData } from "./single-process-snapshot";

export async function CleanUpAfterTests() {
	if (process.env.TAP_SNAPSHOT !== "" && process.env.TAP_SNAPSHOT !== undefined) {
		WriteSnapshotData();
	}

	await CloseMongoConnection();
	await CloseServerConnection();
	await CloseRedisConnection();
	await CloseScoreImportQueue();
}
