#!/usr/bin/env bun

import path from "node:path";
import fs from "node:fs";
import { Glob } from "bun";
import { execSync } from "node:child_process";
const cwd = path.resolve(__dirname, "..");
process.chdir(cwd);

const rootPkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));

for (const workspacePattern of rootPkg.workspaces) {
	// "typescript/*" + "/package.json" => "typescript/*/package.json" (one workspace dir only).
	// "typescript/*" + "*/package.json" would merge *+* into ** and match nested paths / node_modules.
	let glob = new Glob(workspacePattern + "/package.json");

	for (const pkgPath of glob.scanSync(".")) {
		console.log(pkgPath);

		const pkg = JSON.parse(fs.readFileSync(path.join(cwd, pkgPath), "utf8"));

		for (const key of ["devDependencies", "dependencies"]) {
			for (const [dependency, version] of Object.entries(pkg[key] ?? {})) {
				if (version.startsWith("workspace:")) {
					continue;
				}

				if (version.startsWith("catalog:")) {
					continue;
				}

				pkg[key][dependency] = "catalog:";
				rootPkg.catalog[dependency] = version;
			}
		}

		fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, "\t"));
	}
}

fs.writeFileSync("package.json", JSON.stringify(rootPkg, null, "\t"));

execSync("just fmt", { stdio: "inherit" });
