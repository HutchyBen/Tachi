/**
 * Imports seed data (songs, charts, folders, tables, goals, quests, questlines,
 * BMS courses) from the local seeds directory into PostgreSQL.
 *
 * Songs and charts must have been processed by the v3 rerunner scripts first:
 *   1-migrate-to-pg-style.ts  — assigns hex `id`, preserves legacy integer ids
 *   2-split-charts-by-playtype.ts — splits charts-iidx.json → charts-iidx-sp.json etc.
 *
 * Required env vars:
 *   POSTGRES_URL – PostgreSQL connection string
 *
 * Optional env vars:
 *   SEEDS_DIR – path to the seeds/collections directory
 *
 * Run with:
 *   cd server && POSTGRES_URL=... ts-node -r tsconfig-paths/register src/scripts/load-seeds-pg.ts
 */

import type { Database } from "tachi-db";

import { Kysely, PostgresDialect } from "kysely";
import path from "path";
import { Pool } from "pg";

import { buildChartIdMap, importSeeds, toPgGame } from "../services/pg/seeds";

export { buildChartIdMap, importSeeds, toPgGame };

// ── Standalone entrypoint ──────────────────────────────────────────────────

const DEFAULT_SEEDS_DIR = path.resolve(__dirname, "../../../db/seeds");

if (require.main === module) {
	const POSTGRES_URL = process.env.POSTGRES_URL;

	if (!POSTGRES_URL) {
		console.error("[import-seeds] POSTGRES_URL is not set.");
		process.exit(1);
	}

	const seedsDir = process.env.SEEDS_DIR ?? DEFAULT_SEEDS_DIR;

	const pg = new Kysely<Database>({
		dialect: new PostgresDialect({
			pool: new Pool({ connectionString: POSTGRES_URL }),
		}),
	});

	console.log("=== import-seeds → PostgreSQL ===\n");

	importSeeds(pg, seedsDir)
		.then(() => {
			console.log("Done.");
		})
		.catch((err) => {
			console.error(err);
			process.exit(1);
		})
		.finally(() => pg.destroy());
}
