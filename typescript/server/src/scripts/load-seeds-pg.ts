/**
 * Imports seed data (songs, charts, folders, tables, goals, quests, questlines,
 * BMS courses) from the local seeds directory into PostgreSQL.
 *
 * Songs and charts must have been processed by the v3 rerunner scripts first:
 *
 * Required env vars:
 *   POSTGRES_URL – PostgreSQL connection string
 *
 * Required env vars:
 *   SEEDS_DIR         – path to the seeds/collections directory
 *   SEEDS_COMMIT_HASH – git commit SHA to tag the import with (for audit logs)
 *
 * Run with:
 *   just db-load-seeds
 */

import { buildChartIdMap, importSeeds, ImportSeedsSubsetForTests } from "../services/pg/seeds";

export { buildChartIdMap, importSeeds, ImportSeedsSubsetForTests as importSeedsSubset };

// ── Standalone entrypoint ──────────────────────────────────────────────────

if (require.main === module) {
	const seedsDir = process.env.SEEDS_DIR;
	const commitHash = process.env.SEEDS_COMMIT_HASH;

	if (!seedsDir) {
		console.error("SEEDS_DIR is not set.");
		process.exit(1);
	}

	if (!commitHash) {
		console.error("SEEDS_COMMIT_HASH is not set.");
		process.exit(1);
	}

	// Import inline to avoid loading the full server at module-eval time.
	const { ACTION_ImportSeeds } = await import("../actions/import-seeds");
	const { DefaultAdminUser } = await import("../lib/jobs/default-admin-user");

	const taker = await DefaultAdminUser.actionTaker();

	await ACTION_ImportSeeds(taker, { commitHash, seedsDir });
}
