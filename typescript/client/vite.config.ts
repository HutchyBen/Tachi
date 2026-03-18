import react from "@vitejs/plugin-react";
import { config } from "dotenv";
import path from "path";
import { defineConfig } from "vite";
import { createHtmlPlugin } from "vite-plugin-html";

config();

export default defineConfig({
	build: {
		assetsDir: "static",

		outDir: process.env.BUILD_OUT_DIR || "build",
		sourcemap: true,
	},
	css: {
		preprocessorOptions: {
			scss: {
			additionalData:
				process.env.VITE_TCHIC_MODE === "boku"
					? "$primary: #527acc;"
					: "$primary: #e61c6e;",
			},
		},
	},
	plugins: [
		react(),
		createHtmlPlugin({
			inject: {
				data: {
					GOATCOUNTER: process.env.VITE_GOATCOUNTER
						? `<script data-goatcounter="${process.env.VITE_GOATCOUNTER}" async src="//gc.zgo.at/count.js"></script>`
						: "",
					TACHI_NAME: process.env.TACHI_NAME,
					THEME_INIT: `
<script>
const root = document.documentElement;
const theme = localStorage.theme ||
(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

root.style.setProperty("color-scheme", theme === "light" ? "light" : "dark"),
root.setAttribute("data-bs-theme", theme);
</script>
					`,
					VITE_CDN_URL: process.env.VITE_CDN_URL,
				},
			},
		}),
	],
	preview: {
		port: 3000,
	},
	resolve: {
		alias: [
			{
				find: /^tachi-common(.*)$/u,
				replacement: path.resolve(__dirname, "../common/src", "$1"),
			},
			{
				find: /^#(.*)$/u,
				replacement: path.resolve(__dirname, "src/$1"),
			},
		],
	},
	server: {
		host: true,
		port: 3000,
		watch: {
			usePolling: process.env.FORCE_FS_POLLING === "true",
		},
	},
});
