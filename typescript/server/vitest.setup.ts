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

// Set POSTGRES_URL before any app code is imported — config.ts reads it at load time.
process.env.POSTGRES_URL = `postgresql://${POSTGRES_USER}:${POSTGRES_PASS}@${POSTGRES_HOST}/${WORKER_DB_NAME}`;

// Now that env vars are set, we can safely import external packages.
import pg from "pg";
import { afterAll, beforeAll, beforeEach } from "vitest";

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
		await client.query(
			`CREATE DATABASE "${WORKER_DB_NAME}" TEMPLATE tachi_server_test_template`,
		);
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

	await sql`
		DO $$ DECLARE
			row RECORD;
		BEGIN
			FOR row IN (
				SELECT table_name
				FROM information_schema.tables
				WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
			) LOOP
				EXECUTE 'TRUNCATE TABLE ' || quote_ident(row.table_name) || ' RESTART IDENTITY CASCADE';
			END LOOP;
		END $$;
	`.execute(db);
}

beforeAll(async () => {
	await createWorkerDatabase();
});

beforeEach(async () => {
	await resetDatabase();
	// Login-heavy router tests share the in-memory login rate limiter; reset each
	// test so AggressiveRateLimit (15 / 10 min) does not 429 and omit Set-Cookie.
	const { ClearTestingRateLimitCache } = await import("#server/middleware/rate-limiter");
	ClearTestingRateLimitCache();
});

afterAll(
	async () => {
		try {
			const { CloseServerConnection } = await import("#test-utils/mock-api");
			await CloseServerConnection();
		} catch {
			// No mock HTTP server in this worker, or close failed.
		}

		try {
			const { ClosePgConnection } = await import("#services/pg/db");
			await ClosePgConnection();
		} catch {
			// Pool may not have been initialised if no test ran a query.
		}

		await dropWorkerDatabase();
	},
	process.env.CI ? 60_000 : undefined,
);
