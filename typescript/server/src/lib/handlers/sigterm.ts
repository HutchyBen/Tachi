import type http from "http";
import type https from "https";

import { log } from "#lib/logger/log.js";
import { CloseScoreImportQueue } from "#lib/score-import/worker/queue";
import { monkDB } from "#services/mongo/db";
import { ClosePgConnection } from "#services/pg/db.js";
import { CloseRedisConnection } from "#services/redis/redis";

export function HandleSIGTERMGracefully(instance?: http.Server | https.Server) {
	log.info("SIGTERM Received, closing program.", { shutdownInfo: true });

	if (instance) {
		instance.close(() => CloseEverythingElse());
	} else {
		return CloseEverythingElse();
	}
}

async function CloseEverythingElse() {
	log.info("Closing Mongo Database.", { shutdownInfo: true });
	await monkDB.close();

	log.info("Closing database...", { shutdownInfo: true });
	await ClosePgConnection();

	log.info("Closing Redis Connection.", { shutdownInfo: true });
	await CloseRedisConnection();

	log.info("Closing Score Import Queue.", { shutdownInfo: true });
	await CloseScoreImportQueue();

	log.info("Everything closed. Waiting for process to exit naturally.", {
		shutdownInfo: true,
	});
}
