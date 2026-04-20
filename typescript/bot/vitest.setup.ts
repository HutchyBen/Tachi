/**
 * Vitest per-worker setup for parallel test execution.
 *
 * Each worker gets its own isolated Postgres database cloned from the
 * template created in vitest.globalSetup.ts.
 *
 * IMPORTANT: process.env assignments and global mocks at the top level of
 * this module run before the test file's module graph is resolved, so app
 * code that validates env vars at import time (config.ts) sees the right
 * values.
 */

import crypto from "node:crypto";
import { allImportTypes } from "tachi-common/constants/import-types";

const WORKER_ID = crypto.randomUUID().slice(0, 8);
const WORKER_DB_NAME = `tachi_bot_test_${WORKER_ID}`;

const POSTGRES_HOST = "tachi-postgres";
const POSTGRES_USER = "tachi";
const POSTGRES_PASS = "tachi";

// Set POSTGRES_URL before any app code is imported — config.ts reads it at load time.
process.env.POSTGRES_URL = `postgresql://${POSTGRES_USER}:${POSTGRES_PASS}@${POSTGRES_HOST}/${WORKER_DB_NAME}`;

// Mock global fetch before any app code is imported.
// config.ts calls fetch(TACHI_SERVER_LOCATION + "/api/v1/config") at module load time via
// a top-level await (GetServerConfig). We intercept it and return a minimal fake response
// so no real Tachi server is required for tests.
const _realFetch = globalThis.fetch;
globalThis.fetch = (url: string | Request | URL): Promise<Response> => {
	if (url.toString().endsWith("/api/v1/config")) {
		return Promise.resolve({
			json: () =>
				Promise.resolve({
					success: true,
					body: {
						NAME: "Test Tachi",
						TYPE: "boku",
						SIGNUPS_ENABLED: true,
						GAME_GROUPS: ["iidx"],
						IMPORT_TYPES: [...allImportTypes],
					},
				}),
		} as unknown as Response);
	}

	// Blow up loudly if any unexpected fetch slips through — this keeps tests hermetic.
	throw new Error(`Unexpected fetch() in test: ${url.toString()}`);
};

// Now that env vars and fetch are set up, we can safely import external packages.
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
		await client.query(`CREATE DATABASE "${WORKER_DB_NAME}" TEMPLATE tachi_bot_test_template`);
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
});

afterAll(
	async () => {
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
