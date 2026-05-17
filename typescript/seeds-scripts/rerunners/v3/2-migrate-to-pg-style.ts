import fs from "fs";
import path from "path";
import { ALL_GAMES, GAME_GROUP_CONFIGS, GameToGameGroup } from "tachi-common";

import {
	CreateChartID,
	CreateSongID,
	ReadCollection,
	WRITE_COLLECTION_SKIP_BIOME,
	WriteCollection,
} from "../../util";

// ── Stability map ─────────────────────────────────────────────────────────────
// Persists legacy→new ID mappings so re-runs produce the same IDs.

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

function writeStabilityMap(map: StabilityMap) {
	fs.writeFileSync(STABILITY_MAP_PATH, JSON.stringify(map, null, "\t"));
}

const stabilityMap = readStabilityMap();

/**
 * Charts whose pre-remap mongo integer `songID` falls here reference songs absent from rollback
 * (BMS)—TODO remove band once upstream collections include them.
 *
 * Canonical list supplied to this repo was every id inclusive from 97678 through 97928.
 */
const SKIP_CHART_ORPHAN_SONG_MONGO_MIN = 97678;
const SKIP_CHART_ORPHAN_SONG_MONGO_MAX = 97928;

function chartSkippedForOrphanRollbackSongMongoId(songFk: unknown): boolean {
	return (
		typeof songFk === "number" &&
		songFk >= SKIP_CHART_ORPHAN_SONG_MONGO_MIN &&
		songFk <= SKIP_CHART_ORPHAN_SONG_MONGO_MAX
	);
}
// ── Pass 1: songs ─────────────────────────────────────────────────────────────
//
// Writes each song row's final `id` (hex song id).
//
const songIdMap = new Map<string, string>(); // "game:<mongoSongInt>" → hex song id (from id or legacySongID)
const songLegacyIdMap = new Map(); // "game:hexSongId" → integer mongo song id

for (const gameGroup of Object.keys(GAME_GROUP_CONFIGS)) {
	const collection = `songs-${gameGroup}.json`;
	const data = ReadCollection(collection);
	let modified = 0;

	for (const entry of data) {
		const stabilityKey = `${gameGroup}:${entry.id}`;
		const savedId = stabilityMap.songs[stabilityKey];

		const nextSongHexId =
			savedId ?? CreateSongID(Date.now() - 1000000 + (entry.legacySongID ?? entry.id));

		if (entry.id !== undefined && typeof entry.id === "number") {
			entry.legacySongID = entry.id;
			songIdMap.set(stabilityKey, nextSongHexId);
			songLegacyIdMap.set(`${gameGroup}:${nextSongHexId}`, entry.id);
			stabilityMap.songs[stabilityKey] = nextSongHexId;
		}

		entry.id = nextSongHexId;
		delete entry.sid;

		if (typeof entry.legacySongID === "number") {
			songIdMap.set(`${gameGroup}:${entry.legacySongID}`, entry.id);
		}

		modified++;
	}

	if (modified > 0) {
		WriteCollection(collection, data, WRITE_COLLECTION_SKIP_BIOME);
		console.log(`${collection}: migrated ${modified} entries`);
	} else {
		console.log(`${collection}: already migrated, skipped`);
	}
}

// ── Pass 2: charts ────────────────────────────────────────────────────────────
//
// Each chart row gains `id` (hex chart id) and retains `songID` as FK → parent song.
// Charts have many‑to‑one songs: `songID` is normalized from mongo ints to hex song ids.
//
for (const game of ALL_GAMES) {
	const gameGroup = GameToGameGroup(game);
	const collection = `charts-${game}.json`;
	const rawCharts = ReadCollection(collection);
	let droppedHardcoded = 0;
	const data = rawCharts.filter((entry: Record<string, unknown>) => {
		const songFk = entry.songID;
		if (chartSkippedForOrphanRollbackSongMongoId(songFk)) {
			droppedHardcoded++;
			return false;
		}
		return true;
	});
	if (droppedHardcoded > 0) {
		console.warn(
			`${collection}: omitted ${String(droppedHardcoded)} chart(s) (mongo songID in [${String(SKIP_CHART_ORPHAN_SONG_MONGO_MIN)}, ${String(SKIP_CHART_ORPHAN_SONG_MONGO_MAX)}] — rollback gap)`,
		);
	}
	let modified = 0;

	for (const entry of data) {
		// Stability map keyed by mongo chart hash; after migrate it mirrors legacyChartID.
		const mongoChartStableKey =
			typeof entry.chartID === "string" && entry.chartID !== ""
				? entry.chartID
				: typeof entry.legacyChartID === "string" && entry.legacyChartID !== ""
					? entry.legacyChartID
					: undefined;

		const savedHexChartId =
			mongoChartStableKey !== undefined
				? stabilityMap.charts[mongoChartStableKey]
				: undefined;

		const retainedHexChartId =
			mongoChartStableKey === undefined && typeof entry.id === "string" && entry.id !== ""
				? entry.id
				: undefined;

		const nextChartHexId =
			retainedHexChartId ??
			savedHexChartId ??
			CreateChartID(Date.now() - 1000000 + (entry.songID ?? entry.legacySongID));

		if (mongoChartStableKey !== undefined) {
			stabilityMap.charts[mongoChartStableKey] = nextChartHexId;
		}

		if (typeof entry.chartID === "string" && entry.chartID !== "") {
			entry.legacyChartID = entry.chartID;
			delete entry.chartID;
		}

		const newSongFkHexId = songIdMap.get(`${gameGroup}:${entry.songID}`);
		if (newSongFkHexId === undefined) {
			throw new Error(
				`${collection}: chart (mongo chart hash=${mongoChartStableKey ?? "none"}, chart hex provisional=${nextChartHexId}) ` +
					`— parent song FK songID=${JSON.stringify(entry.songID)} → no song with that mongo integer id under songs-${gameGroup}.json ` +
					`(add the song to the collections mirror, fix songID on the chart, or remove the orphaned chart row).`,
			);
		}

		entry.songID = newSongFkHexId;
		entry.id = nextChartHexId;
		delete entry.sid;
		modified++;
	}

	if (modified > 0 || droppedHardcoded > 0) {
		WriteCollection(collection, data, WRITE_COLLECTION_SKIP_BIOME);
		console.log(`${collection}: migrated ${modified} entries`);
	} else {
		console.log(`${collection}: already migrated, skipped`);
	}
}

writeStabilityMap(stabilityMap);
console.log(
	`stability-map.json: saved ${Object.keys(stabilityMap.songs).length} songs, ${Object.keys(stabilityMap.charts).length} charts`,
);
