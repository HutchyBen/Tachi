import type { z } from "zod";

import chalk from "chalk";

import { v3AllGames, V3FormatGame } from "../../common/src";
import { ReadCollection } from "../util";
import { type V3_TABLE_SCHEMA } from "./schemas";

const defaultTableMap = {};

const tables: Array<z.infer<typeof V3_TABLE_SCHEMA>> = ReadCollection("tables.json");

let errs = 0;

for (const t of tables) {
	if (t.default && t.inactive) {
		console.log(
			chalk.red(
				`[TABLE-DEFAULT] The default table for ${V3FormatGame(t.game)} '${
					t.title
				}' is inactive. This is not legal.`,
			),
		);
		errs += 1;
	}

	if (t.default) {
		if (defaultTableMap[t.game]) {
			console.log(
				chalk.red(
					`[TABLE-DEFAULT] There are multiple default tables for ${V3FormatGame(
						t.game,
					)}. This is not legal.`,
				),
			);
		}

		defaultTableMap[t.game] = true;
	}
}

for (const game of v3AllGames) {
	if (!defaultTableMap[game]) {
		console.log(chalk.red(`[TABLE-DEFAULT] There is no default table for ${game}.`));
		errs += 1;
	}
}

if (errs === 0) {
	process.exit(0);
} else {
	process.exit(1);
}
