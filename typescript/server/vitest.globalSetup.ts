import { execSync } from "node:child_process";

import { ensureTestCdnBucket } from "./src/test-utils/ensure-test-cdn-bucket";

/**
 * Global vitest setup — runs ONCE before any workers start.
 *
 * Creates a fully-migrated template database. Workers clone from it
 * instead of running migrations themselves, which is much faster.
 */
export default async function globalSetup() {
	execSync("just server-db-test-template-reset", { stdio: "inherit" });
	await ensureTestCdnBucket();
}
