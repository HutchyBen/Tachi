import { execSync } from "node:child_process";

import { ensureTestCdnBucket } from "./src/test-utils/ensure-test-cdn-bucket";

/**
 * Global vitest setup - runs ONCE before any workers start.
 *
 * Creates a fully-migrated template database. Workers clone from it
 * instead of running migrations themselves, which is much faster.
 */
export default async function globalSetup() {
	const timing = process.env.TACHI_VITEST_TIMING === "1";
	const t0 = performance.now();
	execSync("just server-db-test-template-reset", { stdio: "inherit" });
	const t1 = performance.now();
	await ensureTestCdnBucket();
	const t2 = performance.now();
	if (timing) {
		const resetMs = t1 - t0;
		const cdnMs = t2 - t1;
		console.error(
			`[vitest-timing] globalSetup: template_reset_ms=${resetMs.toFixed(1)} ensure_test_cdn_bucket_ms=${cdnMs.toFixed(1)} total_ms=${(t2 - t0).toFixed(1)}`,
		);
	}
}
