/* eslint-disable no-await-in-loop */
import { loadServerEnvFile } from "#lib/setup/load-server-env";
loadServerEnvFile(process.env.NODE_ENV === "test" ? ".env.test" : ".env");

import { runCronTickOnce } from "#lib/jobs/cron/cron-service";
import { log } from "#lib/log/log";
import { Env } from "#lib/setup/config";
import { ClosePgConnection } from "#services/pg/db";
import { Sleep } from "#utils/misc";
import { writeFileSync } from "fs";
import { applyMigrations } from "tachi-db-migration-engine";

const HEARTBEAT_FILE = "/tmp/worker-heartbeat";

const TICK_MS = 5_000;

process.on("uncaughtException", (err, origin) => {
	log.fatal({ err, origin }, "Uncaught exception, terminating.");
	log.flush(() => process.exit(1));
});

void bootstrap();

/**
 * Often started alongside the API by `just server` (or `bun run cron-worker` alone).
 * Single active scheduler (Postgres `cron_task`); extra processes no-op when the advisory lock is held.
 */
async function bootstrap() {
	await applyMigrations(Env.POSTGRES_URL, Env.MIGRATIONS_DIR);
	log.info({ bootInfo: true }, "tachi cron worker starting.");

	let stopping = false;
	const shutdown = () => {
		stopping = true;
	};
	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);

	// eslint-disable-next-line no-unmodified-loop-condition
	while (!stopping) {
		writeFileSync(HEARTBEAT_FILE, Date.now().toString());
		try {
			await runCronTickOnce();
		} catch (e) {
			log.error(e, "Cron tick error.");
		}
		if (stopping) {
			break;
		}
		await Sleep(TICK_MS);
	}
	log.info("Cron worker stopped.");
	await ClosePgConnection();
	process.exit(0);
}
