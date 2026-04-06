import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		env: {
			NODE_ENV: "test",
		},
		exclude: [
			// Compiled output — not test sources.
			"build/**",
		],
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.test.ts", "build/**"],
		},
	},
});
