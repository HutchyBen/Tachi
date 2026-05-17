/**
 * Vitest per-worker setup for parallel test execution.
 *
 * Each worker gets its own isolated Postgres database cloned from the
 * template created in vitest.globalSetup.ts.
 *
 * IMPORTANT: process.env assignments at the top level of this module run
 * before the test file's module graph is resolved, so app code that reads
 * env vars at import time (config.ts) sees the right values.
 */

import crypto from "node:crypto";

const WORKER_ID = crypto.randomUUID().slice(0, 8);
const WORKER_DB_NAME = `tachi_server_test_${WORKER_ID}`;

const POSTGRES_HOST = "tachi-postgres";
const POSTGRES_USER = "tachi";
const POSTGRES_PASS = "tachi";

// Set POSTGRES_URL before any app code is imported - config.ts reads it at load time.
process.env.POSTGRES_URL = `postgresql://${POSTGRES_USER}:${POSTGRES_PASS}@${POSTGRES_HOST}/${WORKER_DB_NAME}`;

// Now that env vars are set, we can safely import external packages.
import pg from "pg";
import { afterAll, beforeAll, beforeEach } from "vitest";

const TIMING = process.env.TACHI_VITEST_TIMING === "1";
const workerWallStart = performance.now();

let msCreateWorkerDb = 0;
let resetCalls = 0;
let msResetDatabaseTotal = 0;
let msResetDatabaseMax = 0;
let msRateLimitCacheTotal = 0;

const { Client } = pg;

function adminClient() {
	return new Client({
		host: POSTGRES_HOST,
		user: POSTGRES_USER,
		password: POSTGRES_PASS,
		database: "postgres",
	});
}

async function createWorkerDatabase() {
	const client = adminClient();

	await client.connect();

	try {
		const t0 = performance.now();
		await client.query(
			`CREATE DATABASE "${WORKER_DB_NAME}" TEMPLATE tachi_server_test_template`,
		);
		if (TIMING) {
			msCreateWorkerDb += performance.now() - t0;
		}
	} finally {
		await client.end();
	}
}

async function dropWorkerDatabase() {
	const client = adminClient();

	await client.connect();

	try {
		// Terminate any open connections first so DROP DATABASE succeeds.
		await client.query(`
			SELECT pg_terminate_backend(pid)
			FROM pg_stat_activity
			WHERE datname = '${WORKER_DB_NAME}'
		`);

		await client.query(`DROP DATABASE IF EXISTS "${WORKER_DB_NAME}"`);
	} finally {
		await client.end();
	}
}

async function resetDatabase() {
	// Lazily import so env vars are definitely set before the pool is created.
	const { default: db } = await import("#services/pg/db");
	const { sql } = await import("kysely");

	// Dirty-table tracking is installed in the template by vitest.globalSetup.ts:
	// statement-level AFTER INSERT/UPDATE/DELETE triggers on every public base table
	// record their name in `_test_dirty_tables` whenever a test mutates them. We
	// TRUNCATE only those tables (plus the tracker itself), so read-only tests pay
	// for one tiny SELECT and write-heavy tests only pay for the rows they touched.
	const dirty = await sql<{ table_name: string }>`
		SELECT table_name FROM _test_dirty_tables
	`.execute(db);

	if (dirty.rows.length > 0) {
		const idents = ["_test_dirty_tables", ...dirty.rows.map((r) => r.table_name)].map((n) =>
			sql.id(n),
		);
		await sql`TRUNCATE TABLE ${sql.join(idents, sql`, `)} RESTART IDENTITY CASCADE`.execute(db);
	}

	try {
		const { clearGameStatsCacheForTests } = await import("#server/router/api/v1/games/router");
		clearGameStatsCacheForTests();
	} catch {
		// ignore - router not loaded in edge test contexts
	}
}

beforeAll(async () => {
	await createWorkerDatabase();
});

beforeEach(async (ctx) => {
	// Benchmark tasks load real seed data in beforeAll; truncating here would wipe it
	// before every bench() and between iterations.
	const task = ctx.task as { file?: { filepath?: string }; meta?: { benchmark?: boolean } };

	if (task.meta?.benchmark === true) {
		return;
	}

	const fp = task.file?.filepath;

	if (typeof fp === "string" && fp.endsWith(".bench.ts")) {
		return;
	}

	const tReset0 = performance.now();
	await resetDatabase();
	if (TIMING) {
		const d = performance.now() - tReset0;
		resetCalls += 1;
		msResetDatabaseTotal += d;
		msResetDatabaseMax = Math.max(msResetDatabaseMax, d);
	}
	// Login-heavy router tests share the in-memory login rate limiter; reset each
	// test so AggressiveRateLimit (15 / 10 min) does not 429 and omit Set-Cookie.
	const tRl0 = performance.now();
	const { ClearTestingRateLimitCache } = await import("#server/middleware/rate-limiter");
	ClearTestingRateLimitCache();
	if (TIMING) {
		msRateLimitCacheTotal += performance.now() - tRl0;
	}
});

afterAll(async () => {
	let msCloseMock = 0;
	let msClosePg = 0;
	let msDropDb = 0;

	try {
		const t0 = performance.now();
		const { CloseServerConnection } = await import("#test-utils/mock-api");
		await CloseServerConnection();
		msCloseMock = performance.now() - t0;
	} catch {
		// No mock HTTP server in this worker, or close failed.
	}

	try {
		const t0 = performance.now();
		const { ClosePgConnection } = await import("#services/pg/db");
		await ClosePgConnection();
		msClosePg = performance.now() - t0;
	} catch {
		// Pool may not have been initialised if no test ran a query.
	}

	const tDrop0 = performance.now();
	await dropWorkerDatabase();
	msDropDb = performance.now() - tDrop0;

	if (TIMING) {
		const wallMs = performance.now() - workerWallStart;
		const avgReset = resetCalls > 0 ? msResetDatabaseTotal / resetCalls : 0;
		console.error(
			[
				`[vitest-timing] worker=${WORKER_ID}`,
				`create_db_ms=${msCreateWorkerDb.toFixed(1)}`,
				`reset_calls=${resetCalls}`,
				`reset_total_ms=${msResetDatabaseTotal.toFixed(1)}`,
				`reset_avg_ms=${avgReset.toFixed(1)}`,
				`reset_max_ms=${msResetDatabaseMax.toFixed(1)}`,
				`rate_limit_cache_reset_total_ms=${msRateLimitCacheTotal.toFixed(1)}`,
				`teardown_close_mock_ms=${msCloseMock.toFixed(1)}`,
				`teardown_close_pg_ms=${msClosePg.toFixed(1)}`,
				`teardown_drop_db_ms=${msDropDb.toFixed(1)}`,
				`worker_wall_ms=${wallMs.toFixed(1)}`,
			].join(" "),
		);
	}
}, 60_000);
