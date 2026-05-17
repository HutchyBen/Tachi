/**
 * Legacy Mongo → v3 hex ids for folders/tables. Also run `3-migrate-goals-quests-questlines-game.ts`
 * in the same pass for goal/quest/questline `game` strings. After this, run `4-tablefolders-to-object.ts`,
 * `5-folders-to-sql-queries.ts`, then `6-tables-folder-refs-to-slugs.ts` so `tables.json`
 * references folders by slug.
 */

import fs from "fs";
import path from "path";
import {
	type GameGroup,
	LEGACY_GetGPTString,
	LEGACY_GPTStringToGame,
	type LEGACY_Playtype,
} from "tachi-common";

import {
	CreateFolderID,
	CreateTableID,
	ReadCollection,
	WRITE_COLLECTION_SKIP_BIOME,
	WriteCollection,
} from "../../util";

// ── Stability map ─────────────────────────────────────────────────────────────

const STABILITY_MAP_PATH = path.join(__dirname, "stability-map.json");

interface StabilityMap {
	songs: Record<string, string>;
	charts: Record<string, string>;
	folders: Record<string, string>;
	tables: Record<string, string>;
	goals: Record<string, string>;
}

function readStabilityMap(): StabilityMap {
	if (fs.existsSync(STABILITY_MAP_PATH)) {
		const raw = JSON.parse(
			fs.readFileSync(STABILITY_MAP_PATH, "utf-8"),
		) as Partial<StabilityMap>;

		return {
			songs: raw.songs ?? {},
			charts: raw.charts ?? {},
			folders: raw.folders ?? {},
			tables: raw.tables ?? {},
			goals: raw.goals ?? {},
		};
	}

	return { songs: {}, charts: {}, folders: {}, tables: {}, goals: {} };
}

function writeStabilityMap(map: StabilityMap): void {
	fs.writeFileSync(STABILITY_MAP_PATH, JSON.stringify(map, null, "\t"));
}

const stabilityMap = readStabilityMap();

// ── Pass 1: folders ───────────────────────────────────────────────────────────
// Build a map of old folderID → new hex id so tables can update their refs.
const folderIdMap = new Map<string, string>(); // oldFolderID → new hex id

const folders = ReadCollection("folders.json");

for (const entry of folders) {
	if (!entry.id) {
		entry.id = stabilityMap.folders[entry.folderID] ?? CreateFolderID();
	}

	if (entry.folderID) {
		entry.legacyFolderID = entry.folderID;
		folderIdMap.set(entry.folderID, entry.id);
		stabilityMap.folders[entry.folderID] = entry.id;
		delete entry.folderID;
	}

	entry.game = LEGACY_GPTStringToGame(
		LEGACY_GetGPTString(entry.game as GameGroup, entry.playtype as LEGACY_Playtype),
	);
	delete entry.playtype;
}

WriteCollection("folders.json", folders, WRITE_COLLECTION_SKIP_BIOME);
console.log(`folders.json: migrated ${folders.length} entries`);

// ── Pass 2: tables ────────────────────────────────────────────────────────────

const tables = ReadCollection("tables.json");

for (const entry of tables) {
	if (!entry.id) {
		entry.id = stabilityMap.tables[entry.tableID] ?? CreateTableID();
	}

	if (entry.tableID) {
		entry.legacyTableID = entry.tableID;
		stabilityMap.tables[entry.tableID] = entry.id;
		delete entry.tableID;
	}

	entry.game = LEGACY_GPTStringToGame(
		LEGACY_GetGPTString(entry.game as GameGroup, entry.playtype as LEGACY_Playtype),
	);
	delete entry.playtype;

	// Rewrite folder references to new hex ids.
	entry.folders = entry.folders.map((oldId: string) => {
		const newId = folderIdMap.get(oldId);

		if (newId === undefined) {
			throw new Error(`Table "${entry.title}": unknown folder reference ${oldId}`);
		}

		return newId;
	});
}

WriteCollection("tables.json", tables, WRITE_COLLECTION_SKIP_BIOME);
console.log(`tables.json: migrated ${tables.length} entries`);

writeStabilityMap(stabilityMap);
console.log(
	`stability-map.json: saved ${Object.keys(stabilityMap.folders).length} folders, ${
		Object.keys(stabilityMap.tables).length
	} tables`,
);
