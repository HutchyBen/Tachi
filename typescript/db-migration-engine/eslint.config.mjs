import configTachi from "eslint-config-tachi";

export default [
	...configTachi.base,
	{
		ignores: ["src/generated/**", "js/**", "node_modules/**", "**/*.js"],
	},
];
