import configTachi from "eslint-config-tachi";

export default [
	...configTachi.base,
	{ ...configTachi.node, files: ["vite.config.js"] },
	configTachi.react,
	{
		ignores: ["build/**", "public/**", "node_modules/**"],
	},
];
