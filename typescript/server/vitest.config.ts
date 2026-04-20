import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** When set (e.g. `test:coverage:set-user-supporter`), enforce 100% coverage on that file only. */
const coverageSupporterActionOnly = process.env.VITEST_COVERAGE_SUPPORTER_ACTION === "1";

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
		passWithNoTests: true,

		// resetDatabase() per test can exceed Vitest defaults under parallel workers.
		testTimeout: 20_000,
		hookTimeout: 60_000,

		// `vitest bench` uses this same config: globalSetup + setupFiles + per-worker POSTGRES_URL.
		// Use for API / DB performance work as well as microbenches (*.bench.ts).
		//
		// Static env vars. POSTGRES_URL is set dynamically per-worker in vitest.setup.ts
		// so each worker gets its own isolated database. App config (`TACHI_*`) comes from `.env.test`
		// loaded in `config.ts` (NODE_ENV must be `test` before that import).
		env: {
			NODE_ENV: "test",
			PORT: "8080",
			MONGO_URL: "tachi-mongo",
			REDIS_URL: "tachi-redis",
			MIGRATIONS_DIR: "/tachi/db/migrations",
			LOG_LEVEL: "warn",
			VERSION: "test",
			COMMIT_HASH: "test",
		},

		// Parallel test execution — each worker gets its own isolated Postgres database.
		fileParallelism: true,
		globalSetup: "./vitest.globalSetup.ts",
		setupFiles: "./vitest.setup.ts",
		// forks pool gives stronger process isolation between workers.
		pool: "forks",

		coverage: {
			enabled: true,
			provider: "v8",
			// Defaults plus lcov; `json` emits coverage-final.json for tachi-coverage-tools.
			reporter: ["text", "html", "clover", "json", "lcov"],
			include: coverageSupporterActionOnly
				? ["src/actions/set-user-supporter-status.ts"]
				: ["src/**/*.ts"],
			exclude: ["src/**/*.test.ts", "src/**/*.bench.ts", "src/test-utils/**"],
			...(coverageSupporterActionOnly
				? {
						thresholds: {
							lines: 100,
							branches: 100,
							functions: 100,
							statements: 100,
						},
					}
				: {}),
		},
	},
});
