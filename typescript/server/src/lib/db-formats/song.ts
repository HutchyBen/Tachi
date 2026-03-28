import type { GameGroup, integer, MONGO_SongDocument, MONGO_SongDocumentData } from "tachi-common";

import DB from "#services/pg/db";

/**
 * Fetches a song by its legacy numeric ID (from the URL / Mongo era), including
 * `search_terms` / `alt_titles` arrays, and returns a fully-formed MONGO_SongDocument
 * plus the Postgres UUID needed for downstream chart queries.
 */
export async function GetSongByLegacyID(
	game: GameGroup,
	legacyId: number,
): Promise<{ doc: MONGO_SongDocument; pgId: string } | undefined> {
	const row = await DB.selectFrom("song")
		.select(["id", "legacy_id", "title", "artist", "search_terms", "alt_titles", "data"])
		.where("legacy_id", "=", legacyId)
		.where("game_group", "=", game)
		.executeTakeFirst();

	if (!row) {
		return undefined;
	}

	const doc: MONGO_SongDocument = {
		id: row.legacy_id,
		title: row.title,
		artist: row.artist,
		searchTerms: row.search_terms,
		altTitles: row.alt_titles,
		data: row.data as MONGO_SongDocumentData[typeof game],
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
		.select(["id", "legacy_id", "title", "artist", "search_terms", "alt_titles", "data"])
		.where("game_group", "=", game)
		.where("legacy_id", "in", unique)
		.execute();

	if (songRows.length === 0) {
		return [];
	}

	const byLegacy = new Map<integer, MONGO_SongDocument>();

	for (const row of songRows) {
		byLegacy.set(row.legacy_id, {
			id: row.legacy_id,
			title: row.title,
			artist: row.artist,
			searchTerms: row.search_terms,
			altTitles: row.alt_titles,
			data: row.data as MONGO_SongDocumentData[typeof game],
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
