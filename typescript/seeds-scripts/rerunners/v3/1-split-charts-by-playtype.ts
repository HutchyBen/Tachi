import fs from "fs";
import path from "path";
import { ALL_GAMES, GAME_GROUP_CONFIGS } from "tachi-common";

import { ReadCollection, WRITE_COLLECTION_SKIP_BIOME, WriteCollection } from "../../util";

const COLLECTIONS_DIR = path.join(__dirname, "../../../../db/seeds");

// Games where the Postgres game name equals the game group name (single playtype).
// These files are left as-is.
const SINGLE_PT_GAMES = new Set([
	"arcaea",
	"chunithm",
	"jubeat",
	"maimai",
	"maimaidx",
	"museca",
	"ongeki",
	"popn",
	"sdvx",
	"wacca",
]);

for (const game of Object.keys(GAME_GROUP_CONFIGS)) {
	if (!fs.existsSync(path.join(COLLECTIONS_DIR, `charts-${game}.json`))) {
		console.log(`charts-${game}.json: does not exist, skipping`);
		continue;
	}

	if (SINGLE_PT_GAMES.has(game)) {
		console.log(`charts-${game}: single playtype, skipping`);
		continue;
	}

	const data = ReadCollection(`charts-${game}.json`);

	const byPlaytype = new Map();

	for (const entry of data) {
		const pt = entry.playtype.toLowerCase();

		if (!byPlaytype.has(pt)) {
			byPlaytype.set(pt, []);
		}

		byPlaytype.get(pt).push(entry);
	}

	for (const [pt, charts] of byPlaytype) {
		const newName = `charts-${game}-${pt}.json`;

		WriteCollection(newName, charts, WRITE_COLLECTION_SKIP_BIOME);
		console.log(`${newName}: wrote ${charts.length} charts`);
	}

	fs.unlinkSync(path.join(COLLECTIONS_DIR, `charts-${game}.json`));
	console.log(`charts-${game}.json: deleted`);
}

// now, for each collection remove the playtype field.
for (const nugame of ALL_GAMES) {
	const data = ReadCollection(`charts-${nugame}.json`);
	for (const entry of data) {
		delete entry.playtype;
	}
	WriteCollection(`charts-${nugame}.json`, data, WRITE_COLLECTION_SKIP_BIOME);
	console.log(`charts-${nugame}.json: removed playtype field`);
}
