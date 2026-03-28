import type http from "http";
import type https from "https";

import { log } from "#lib/log/log";
import { CloseScoreImportQueue } from "#lib/score-import/worker/queue";
import { monkDB } from "#services/mongo/db";
import { ClosePgConnection } from "#services/pg/db";
import { CloseRedisConnection } from "#services/redis/redis";

export function HandleSIGTERMGracefully(instance?: http.Server | https.Server) {
	log.info({ shutdownInfo: true }, "SIGTERM Received, closing program.");

	if (instance) {
		instance.close(() => CloseEverythingElse());
	} else {
		return CloseEverythingElse();
	}
}

async function CloseEverythingElse() {
	log.info({ shutdownInfo: true }, "Closing Mongo Database.");
	await monkDB.close();

	log.info({ shutdownInfo: true }, "Closing database...");
	await ClosePgConnection();

	log.info({ shutdownInfo: true }, "Closing Redis Connection.");
	await CloseRedisConnection();

	log.info({ shutdownInfo: true }, "Closing Score Import Queue.");
	await CloseScoreImportQueue();

	log.info(
		{
			shutdownInfo: true,
		},
		"Everything closed. Waiting for process to exit naturally.",
	);
}
