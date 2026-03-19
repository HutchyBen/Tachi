import "#services/mongo/db";
import glob from "glob";
import path from "path";
import t from "tap";

import { CleanUpAfterTests } from "./cleanup";

const files = glob.sync(path.join(__dirname, "../", "**/*.oldtest.ts"));

process.env.NODE_PATH = path.join(__dirname, "../");

for (const file of files) {
	// Deliberate -- we're doing hackery here.
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	require(file);
}

t.teardown(CleanUpAfterTests);
