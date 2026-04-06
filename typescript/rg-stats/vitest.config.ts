import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	test: {
		env: {
			NODE_ENV: "test",
		},
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: [
				"src/**/*.test.ts",
				"src/test-utils/**",
				// Barrel only re-exports algorithms — no executable lines to cover.
				"src/index.ts",
				// Type-only / unused by current test surface (Tap nyc also did not require these).
				"src/util/types.ts",
				"src/util/options.ts",
			],
			thresholds: {
				lines: 100,
				statements: 100,
				functions: 100,
				branches: 100,
			},
		},
	},
	resolve: {
		alias: {
			"rg-stats": path.resolve(__dirname, "src/index.ts"),
		},
	},
});
