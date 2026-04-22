/* eslint-disable no-await-in-loop */
import { loadServerEnvFile } from "#lib/setup/load-server-env";
loadServerEnvFile(process.env.NODE_ENV === "test" ? ".env.test" : ".env");

import { JOB_KIND_SCORE_IMPORT } from "#lib/jobs/job-queue/constants";
import { ClaimNextJob, MarkJobDone, MarkJobFailed } from "#lib/jobs/job-queue/queue-ops";
import { log } from "#lib/log/log";
import { CloseScoreImportQueue } from "#lib/score-import/worker/queue";
import { processScoreImportJobFromPayload } from "#lib/score-import/worker/score-import-job-processor";
import { Env } from "#lib/setup/config";
import { ClosePgConnection } from "#services/pg/db";
import { CloseRedisConnection } from "#services/redis/redis";
import { applyMigrations } from "tachi-db-migration-engine";

const POLL_MS = 250;

void bootstrap();

/**
 * Often run by `just server` (one or more via `TACHI_SERVER_JOB_WORKER_COUNT`); each process claims
 * with `FOR UPDATE SKIP LOCKED`.
 */
async function bootstrap() {
	await applyMigrations(Env.POSTGRES_URL, Env.MIGRATIONS_DIR);
	log.info({ bootInfo: true }, "tachi job-queue worker starting (Postgres job_queue).");
	let stopping = false;
	const shutdown = () => {
		stopping = true;
	};
	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
	// eslint-disable-next-line no-unmodified-loop-condition
	while (!stopping) {
		const job = await ClaimNextJob();
		if (!job) {
			if (stopping) {
				break;
			}
			await new Promise((r) => {
				setTimeout(r, POLL_MS);
			});
			continue;
		}
		try {
			switch (job.job_kind) {
				case JOB_KIND_SCORE_IMPORT:
					await processScoreImportJobFromPayload(job.payload);
					break;
				default:
					log.error({ job_kind: job.job_kind, row_id: job.row_id }, "Unknown job_kind.");
					throw new Error(`Unknown job_kind ${String(job.job_kind)}`);
			}
			await MarkJobDone(job.row_id);
		} catch (e) {
			log.error(e, `Job ${job.row_id} failed.`);
			await MarkJobFailed(job.row_id);
		}
	}
	log.info("Job worker loop stopped, closing resources.");
	await CloseScoreImportQueue();
	await CloseRedisConnection();
	await ClosePgConnection();
	process.exit(0);
}
