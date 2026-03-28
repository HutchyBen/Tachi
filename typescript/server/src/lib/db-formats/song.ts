import type { GameGroup, integer, MONGO_SongDocument, SongDocumentData } from "tachi-common";

import DB from "#services/pg/db";

/**
 * Fetches a song by its legacy numeric ID (from the URL / Mongo era), together
 * with its search-term and alt-title rows, and returns a fully-formed
 * SongDocument plus the Postgres UUID needed for downstream chart queries.
 */
export async function GetSongByLegacyID(
	game: GameGroup,
	legacyId: number,
): Promise<{ doc: MONGO_SongDocument; pgId: string } | undefined> {
	const row = await DB.selectFrom("song")
		.select(["id", "legacy_id", "title", "artist", "data"])
		.where("legacy_id", "=", legacyId)
		.where("game_group", "=", game)
		.executeTakeFirst();

	if (!row) {
		return undefined;
	}

	const [searchTermRows, altTitleRows] = await Promise.all([
		DB.selectFrom("song_search_term")
			.select("search_term")
			.where("song_id", "=", row.id)
			.execute(),
		DB.selectFrom("song_alt_title").select("alt_title").where("song_id", "=", row.id).execute(),
	]);

	const doc: MONGO_SongDocument = {
		id: row.legacy_id,
		title: row.title,
		artist: row.artist,
		searchTerms: searchTermRows.map((r) => r.search_term),
		altTitles: altTitleRows.map((r) => r.alt_title),
		data: row.data as SongDocumentData[typeof game],
	};

	return { doc, pgId: row.id };
}

/**
 * Batch-loads song documents by legacy numeric IDs (order follows first occurrence in `legacyIds`).
 */
export async function GetSongsByLegacyIDs(
	game: GameGroup,
	legacyIds: Array<integer>,
): Promise<Array<MONGO_SongDocument>> {
	if (legacyIds.length === 0) {
		return [];
	}

	const unique = [...new Set(legacyIds)];

	const songRows = await DB.selectFrom("song")
		.select(["id", "legacy_id", "title", "artist", "data"])
		.where("game_group", "=", game)
		.where("legacy_id", "in", unique)
		.execute();

	if (songRows.length === 0) {
		return [];
	}

	const ids = songRows.map((s) => s.id);

	const [searchTermRows, altTitleRows] = await Promise.all([
		DB.selectFrom("song_search_term")
			.select(["song_id", "search_term"])
			.where("song_id", "in", ids)
			.execute(),
		DB.selectFrom("song_alt_title")
			.select(["song_id", "alt_title"])
			.where("song_id", "in", ids)
			.execute(),
	]);

	const termsBySong = new Map<string, string[]>();
	const altsBySong = new Map<string, string[]>();

	for (const r of searchTermRows) {
		let list = termsBySong.get(r.song_id);

		if (!list) {
			list = [];
			termsBySong.set(r.song_id, list);
		}

		list.push(r.search_term);
	}

	for (const r of altTitleRows) {
		let list = altsBySong.get(r.song_id);

		if (!list) {
			list = [];
			altsBySong.set(r.song_id, list);
		}

		list.push(r.alt_title);
	}

	const byLegacy = new Map<integer, MONGO_SongDocument>();

	for (const row of songRows) {
		byLegacy.set(row.legacy_id, {
			id: row.legacy_id,
			title: row.title,
			artist: row.artist,
			searchTerms: termsBySong.get(row.id) ?? [],
			altTitles: altsBySong.get(row.id) ?? [],
			data: row.data as SongDocumentData[typeof game],
		});
	}

	const out: Array<MONGO_SongDocument> = [];

	for (const id of legacyIds) {
		const doc = byLegacy.get(id);

		if (doc) {
			out.push(doc);
		}
	}

	return out;
}
