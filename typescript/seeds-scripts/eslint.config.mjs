import configTachi from "eslint-config-tachi";

export default [
	...configTachi.base,
	configTachi.node,
	{
		ignores: ["../collections/**", "node_modules/**", "js/**", "**/*.js"],
	},
];
