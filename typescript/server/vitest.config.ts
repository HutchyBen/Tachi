import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read the test server config as a raw string — config.ts will JSON5-parse it at load time.
const tachiConfig = fs.readFileSync(path.join(__dirname, "test.conf.json5"), "utf-8");

// Workspace root: /tachi/typescript/
const TYPESCRIPT_ROOT = path.resolve(__dirname, "..");

/**
 * Resolve '#*' package-level imports (Node.js 'imports' field) correctly for
 * every workspace package. Without this, vitest's alias applies the server's
 * src/ root to '#*' imports made inside other workspace packages (e.g. bliss,
 * tachi-common), causing "Cannot find module" errors.
 *
 * Strategy: derive the package root from the importer's absolute path, then
 * resolve the specifier relative to that package's src/ directory.
 */
const workspaceHashAliasPlugin: Plugin = {
	name: "workspace-hash-alias",
	resolveId(source, importer) {
		if (!source.startsWith("#")) {
			return null;
		}

		const specifier = source.slice(1);

		// When the importer is inside /tachi/typescript/<pkg>/…, resolve
		// '#specifier' relative to /tachi/typescript/<pkg>/src/.
		if (importer) {
			const rel = path.relative(TYPESCRIPT_ROOT, importer);

			if (!rel.startsWith("..")) {
				const pkgName = rel.split(path.sep)[0];
				return path.join(TYPESCRIPT_ROOT, pkgName, "src", specifier);
			}
		}

		// Fallback: resolve relative to the server's own src/.
		return path.join(__dirname, "src", specifier);
	},
};

export default defineConfig({
	plugins: [workspaceHashAliasPlugin],

	test: {
		// Static env vars. POSTGRES_URL is set dynamically per-worker in vitest.setup.ts
		// so each worker gets its own isolated database.
		env: {
			NODE_ENV: "test",
			PORT: "8080",
			// Still required by config.ts validation; unused by new Postgres-based tests.
			MONGO_URL: "tachi-mongo",
			REDIS_URL: "tachi-redis",
			MIGRATIONS_DIR: "/tachi/db/migrations",
			LOG_LEVEL: "warn",
			VERSION: "test",
			COMMIT_HASH: "test",
			TACHI_CONFIG: tachiConfig,
		},

		// Parallel test execution — each worker gets its own isolated Postgres database.
		fileParallelism: true,
		globalSetup: "./vitest.globalSetup.ts",
		setupFiles: "./vitest.setup.ts",
		// forks pool gives stronger process isolation between workers.
		pool: "forks",

		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.test.ts", "src/**/*.oldtest.ts", "src/test-utils/**"],
		},
	},
});
