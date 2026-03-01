import configTachi from "eslint-config-tachi";

export default [
	...configTachi.base,
	configTachi.react,
	{
		ignores: ["build/**", "public/**", "node_modules/**"],
	},
];
