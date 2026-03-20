import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read the test server config as a raw string — config.ts will JSON5-parse it at load time.
const tachiConfig = fs.readFileSync(path.join(__dirname, "test.conf.json5"), "utf-8");

export default defineConfig({
	resolve: {
		// Map #* path aliases to src/* so vite-node resolves them correctly.
		alias: [
			{
				find: /^#(.+)/u,
				replacement: `${path.resolve(__dirname, "src")}/$1`,
			},
		],
	},

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
