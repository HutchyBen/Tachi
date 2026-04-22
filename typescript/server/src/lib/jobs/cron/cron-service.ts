import { getCronTaskDefinitions } from "#lib/jobs/cron/cron-registry";
import { log } from "#lib/log/log";
import DB from "#services/pg/db";
import CronExpressionParser from "cron-parser";
import { sql } from "kysely";

/** Namespaces `pg_try_advisory_lock` for the cron scheduler. */
const CRON_ADVISORY_KEY1 = 0x54_61_63_68; // "Tach"
const CRON_ADVISORY_KEY2 = 0x63_72_6f_6e; // "cron"

/**
 * Next cron fire strictly after `last`, that is still <= `now`.
 * If none, `null` (not due). "Skip missed" to the latest such fire time.
 */
export function getDueFireTime(schedule: string, last: Date | null, now: Date): Date | null {
	const it = CronExpressionParser.parse(schedule, {
		currentDate: last ? new Date(last.getTime() + 1) : new Date(0),
	});
	const first = it.next().toDate();
	if (first.getTime() > now.getTime()) {
		return null;
	}
	let lastDue = first;
	for (;;) {
		const n = it.next().toDate();
		if (n.getTime() > now.getTime()) {
			return lastDue;
		}
		lastDue = n;
	}
}

export async function syncCronTasksFromRegistry(): Promise<void> {
	const defs = getCronTaskDefinitions();
	const now = new Date().toISOString();
	for (const d of defs) {
		await DB.insertInto("cron_task")
			.values({
				id: d.id,
				schedule: d.schedule,
				description: d.description,
				created_at: now,
				updated_at: now,
				last_scheduled_at: null,
			})
			.onConflict((oc) =>
				oc.column("id").doUpdateSet({
					schedule: d.schedule,
					description: d.description,
					updated_at: now,
				}),
			)
			.execute();
	}
}

async function tryAcquireCronTickLock(): Promise<boolean> {
	const r = await sql<{ acquired: boolean }>`
		SELECT pg_try_advisory_lock(${CRON_ADVISORY_KEY1}, ${CRON_ADVISORY_KEY2}) AS acquired
	`.execute(DB);
	const row = r.rows[0] as { acquired: boolean } | undefined;
	return row?.acquired === true;
}

async function releaseCronTickLock(): Promise<void> {
	await sql`SELECT pg_advisory_unlock(${CRON_ADVISORY_KEY1}, ${CRON_ADVISORY_KEY2})`.execute(DB);
}

export async function runCronTickOnce(): Promise<void> {
	const got = await tryAcquireCronTickLock();
	if (!got) {
		return;
	}
	try {
		await syncCronTasksFromRegistry();
		const now = new Date();
		const rows = await DB.selectFrom("cron_task")
			.select(["cron_task.id", "cron_task.schedule", "cron_task.last_scheduled_at"])
			.execute();
		const byId = new Map(rows.map((r) => [r.id, r]));
		for (const def of getCronTaskDefinitions()) {
			const row = byId.get(def.id);
			if (!row) {
				continue;
			}
			const last = row.last_scheduled_at ? new Date(row.last_scheduled_at) : null;
			const due = getDueFireTime(def.schedule, last, now);
			if (!due) {
				continue;
			}
			const scheduledAtIso = due.toISOString();
			const execRow = await DB.insertInto("cron_task_execution")
				.values({
					task_id: def.id,
					scheduled_at: scheduledAtIso,
					status: "running",
					completed_at: null,
					output: null,
					error: null,
				})
				.returning("cron_task_execution.id")
				.executeTakeFirstOrThrow();

			try {
				await def.run();
				await DB.updateTable("cron_task")
					.set({
						last_scheduled_at: scheduledAtIso,
						updated_at: new Date().toISOString(),
					})
					.where("cron_task.id", "=", def.id)
					.execute();
				await DB.updateTable("cron_task_execution")
					.set({
						status: "success",
						completed_at: new Date().toISOString(),
						output: null,
						error: null,
					})
					.where("cron_task_execution.id", "=", execRow.id)
					.execute();
				log.info(`Cron task ${def.id} completed for fire ${scheduledAtIso}.`);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				log.error({ err }, `Cron task ${def.id} failed.`);
				await DB.updateTable("cron_task")
					.set({
						last_scheduled_at: scheduledAtIso,
						updated_at: new Date().toISOString(),
					})
					.where("cron_task.id", "=", def.id)
					.execute();
				await DB.updateTable("cron_task_execution")
					.set({
						status: "failure",
						completed_at: new Date().toISOString(),
						error: message,
					})
					.where("cron_task_execution.id", "=", execRow.id)
					.execute();
			}
		}
	} finally {
		await releaseCronTickLock();
	}
}
