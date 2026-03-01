import configTachi from "eslint-config-tachi";

export default [
	...configTachi.base,
	{
		ignores: ["js/**", "node_modules/**"],
	},
];
