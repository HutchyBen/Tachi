import type { GameGroup, integer, MONGO_SongDocument, SongDocumentData } from "tachi-common";

import DB from "#services/pg/db";
import { type Selection } from "kysely";
import { type Database } from "tachi-db";

export const SELECT_SONG_DOCUMENT = [
	"song.id as song_id",
	"song.legacy_id as song_legacy_id",
	"song.title as song_title",
	"song.artist as song_artist",
	"song.search_terms as song_search_terms",
	"song.alt_titles as song_alt_titles",
	"song.data as song_data",
	"song.game_group as song_game_group",
] as const;

/** Full `song` row for single-table queries (e.g. title search). */
export const SELECT_SONG_ROW = [
	"song.id",
	"song.legacy_id",
	"song.game_group",
	"song.title",
	"song.artist",
	"song.search_terms",
	"song.alt_titles",
	"song.fts_document",
	"song.textsearch",
	"song.data",
] as const;

export type SongRow = Selection<Database, "song", (typeof SELECT_SONG_ROW)[number]>;

/**
 * Fetches a song by its legacy numeric ID (from the URL / Mongo era), including
 * `search_terms` / `alt_titles` arrays, and returns a fully-formed MONGO_SongDocument
 * plus the Postgres UUID needed for downstream chart queries.
 */
export async function GetSongByLegacyID(
	game: GameGroup,
	legacyId: number,
): Promise<{ doc: MONGO_SongDocument; newSongID: string } | undefined> {
	const row = await DB.selectFrom("song")
		.select(SELECT_SONG_DOCUMENT)
		.where("legacy_id", "=", legacyId)
		.where("game_group", "=", game)
		.executeTakeFirst();

	if (!row) {
		return undefined;
	}

	const doc: MONGO_SongDocument = {
		id: row.song_legacy_id,
		title: row.song_title,
		artist: row.song_artist,
		searchTerms: row.song_search_terms,
		altTitles: row.song_alt_titles,
		data: row.song_data as SongDocumentData[typeof game],
	};

	return { doc, newSongID: row.song_id };
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
		.select(SELECT_SONG_DOCUMENT)
		.where("game_group", "=", game)
		.where("legacy_id", "in", unique)
		.execute();

	if (songRows.length === 0) {
		return [];
	}

	const byLegacy = new Map<integer, MONGO_SongDocument>();

	for (const row of songRows) {
		byLegacy.set(row.song_legacy_id, {
			id: row.song_legacy_id,
			title: row.song_title,
			artist: row.song_artist,
			searchTerms: row.song_search_terms,
			altTitles: row.song_alt_titles,
			data: row.song_data as SongDocumentData[typeof game],
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

export function ToSongDocument(
	row: Selection<Database, "song", (typeof SELECT_SONG_DOCUMENT)[number]>,
): MONGO_SongDocument {
	return {
		id: row.song_legacy_id,
		title: row.song_title,
		artist: row.song_artist,
		searchTerms: row.song_search_terms,
		altTitles: row.song_alt_titles,
		data: row.song_data as SongDocumentData[typeof row.song_game_group],
	};
}

export function ToSongDocumentFromRow(row: SongRow): MONGO_SongDocument {
	return {
		id: row.legacy_id,
		title: row.title,
		artist: row.artist,
		searchTerms: row.search_terms,
		altTitles: row.alt_titles,
		data: row.data as SongDocumentData[typeof row.game_group],
	};
}
