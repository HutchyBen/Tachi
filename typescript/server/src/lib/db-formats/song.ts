import DB from "#services/pg/db";
import type { GameGroup, SongDocument, SongDocumentData } from "tachi-common";

/**
 * Fetches a song by its legacy numeric ID (from the URL / Mongo era), together
 * with its search-term and alt-title rows, and returns a fully-formed
 * SongDocument plus the Postgres UUID needed for downstream chart queries.
 */
export async function GetSongByLegacyID(
	game: GameGroup,
	legacyId: number,
): Promise<{ doc: SongDocument; pgId: string } | undefined> {
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

	const doc: SongDocument = {
		id: row.legacy_id,
		title: row.title,
		artist: row.artist,
		searchTerms: searchTermRows.map((r) => r.search_term),
		altTitles: altTitleRows.map((r) => r.alt_title),
		data: row.data as SongDocumentData[typeof game],
	};

	return { doc, pgId: row.id };
}
