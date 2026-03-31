import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		exclude: [
			// Compiled output — not test sources.
			"build/**",
			// Legacy tap-based tests not yet migrated to vitest.
			"src/index.test.ts",
			"src/config/config.test.ts",
			"src/constants/bms-tables.test.ts",
		],
	},
});
