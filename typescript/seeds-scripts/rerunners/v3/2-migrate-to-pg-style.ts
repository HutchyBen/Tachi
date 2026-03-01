import fs from "fs";
import path from "path";
import {
	GAME_GROUP_CONFIGS,
	GAME_PT_CONFIGS,
	GPTStringToV3,
	V3ToGameGroup,
} from "../../../common/src";

const { CreateSongID, CreateChartID, ReadCollection, WriteCollection } = require("../../util");

// ── Stability map ─────────────────────────────────────────────────────────────
// Persists legacy→new ID mappings so re-runs produce the same IDs.

const STABILITY_MAP_PATH = path.join(__dirname, "stability-map.json");

interface StabilityMap {
	songs: Record<string, string>;
	charts: Record<string, string>;
	folders: Record<string, string>;
	tables: Record<string, string>;
}

function readStabilityMap(): StabilityMap {
	if (fs.existsSync(STABILITY_MAP_PATH)) {
		return JSON.parse(fs.readFileSync(STABILITY_MAP_PATH, "utf-8")) as StabilityMap;
	}

	return { songs: {}, charts: {}, folders: {}, tables: {} };
}

function writeStabilityMap(map: StabilityMap): void {
	fs.writeFileSync(STABILITY_MAP_PATH, JSON.stringify(map, null, "\t"));
}

const stabilityMap = readStabilityMap();

// ── Pass 1: songs ─────────────────────────────────────────────────────────────
// Build per-game maps keyed by old integer id:
//   songIdMap       → new hex id
//   songLegacyIdMap → legacySongID
const songIdMap = new Map(); // "game:integerID" → new hex id
const songLegacyIdMap = new Map(); // "game:newHexId" → legacySongID

for (const gameGroup of Object.keys(GAME_GROUP_CONFIGS)) {
	const collection = `songs-${gameGroup}.json`;
	const data = ReadCollection(collection);
	let modified = 0;

	for (const entry of data) {
		const stabilityKey = `${gameGroup}:${entry.id}`;
		const savedId = stabilityMap.songs[stabilityKey];

		entry.sid =
			savedId ?? CreateSongID(Date.now() - 1000000 + (entry.legacySongID ?? entry.id));

		// Preserve the old integer id before overwriting.
		if (entry.id !== undefined && typeof entry.id === "number") {
			entry.legacySongID = entry.id;
			songIdMap.set(stabilityKey, entry.sid);
			songLegacyIdMap.set(`${gameGroup}:${entry.sid}`, entry.id);
			stabilityMap.songs[stabilityKey] = entry.sid;
		}

		entry.id = entry.sid;
		delete entry.sid;
		modified++;
	}

	if (modified > 0) {
		WriteCollection(collection, data);
		console.log(`${collection}: migrated ${modified} entries`);
	} else {
		console.log(`${collection}: already migrated, skipped`);
	}
}

// ── Pass 2: charts ────────────────────────────────────────────────────────────

for (const oldGpt of Object.keys(GAME_PT_CONFIGS)) {
	const game = GPTStringToV3(oldGpt as any);
	const gameGroup = V3ToGameGroup(game);
	const collection = `charts-${game}.json`;
	const data = ReadCollection(collection);
	let modified = 0;

	for (const entry of data) {
		const legacyChartId: string | undefined = entry.chartID;
		const savedId =
			legacyChartId !== undefined ? stabilityMap.charts[legacyChartId] : undefined;

		entry.sid =
			savedId ?? CreateChartID(Date.now() - 1000000 + (entry.songID ?? entry.legacySongID));

		// Keep old MongoDB chartID around for reference.
		if (entry.chartID) {
			entry.legacyChartID = entry.chartID;
			stabilityMap.charts[entry.chartID] = entry.sid;
			delete entry.chartID;
		}

		// Rewrite songID to the new hex song id.
		const newSongId = songIdMap.get(`${gameGroup}:${entry.songID}`);
		if (newSongId === undefined) {
			console.error(`Chart ${entry.sid} has no songID?`);
			continue;
		}

		entry.songID = newSongId;

		entry.id = entry.sid;
		delete entry.sid;
		modified++;
	}

	if (modified > 0) {
		WriteCollection(collection, data);
		console.log(`${collection}: migrated ${modified} entries`);
	} else {
		console.log(`${collection}: already migrated, skipped`);
	}
}

writeStabilityMap(stabilityMap);
console.log(
	`stability-map.json: saved ${Object.keys(stabilityMap.songs).length} songs, ${Object.keys(stabilityMap.charts).length} charts`,
);
