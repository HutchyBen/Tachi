import { execSync } from "node:child_process";

/**
 * Global vitest setup - runs ONCE before any workers start.
 *
 * Creates a fully-migrated template database. Workers clone from it
 * instead of running migrations themselves, which is much faster.
 */
export default function globalSetup() {
	execSync("just bot-db-test-template-reset", { stdio: "inherit" });
}
