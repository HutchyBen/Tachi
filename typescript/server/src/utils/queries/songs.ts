import type { KtLogger } from "#lib/log/log";
import type { GameGroup, integer, MONGO_SongDocument } from "tachi-common";
import type { Song } from "tachi-db";

import {
	AmbiguousTitleFailure,
	InternalFailure,
} from "#lib/score-import/framework/common/converter-failures";
import DB from "#services/pg/db";
import { sql } from "kysely";

import { EscapeStringRegexp } from "../misc";

function rowToSongDoc(row: Song): MONGO_SongDocument {
	return {
		id: row.legacy_id,
		title: row.title,
		artist: row.artist,
		searchTerms: row.search_terms,
		altTitles: row.alt_titles,
		data: row.data as MONGO_SongDocument["data"],
	};
}

/**
 * Finds a song document for the given game with the given title (or alt-title).
 * This is NOT the preferred way to find a song, as encodings, and typos, make this
 * rather difficult. Prefer other functions!
 * @param game - The game to search upon.
 * @param title - The song title to match.
 * @returns MONGO_SongDocument
 */
export async function FindSongOnTitle(
	game: GameGroup,
	title: string,
): Promise<MONGO_SongDocument | null> {
	const res = await DB.selectFrom("song")
		.selectAll()
		.where("game_group", "=", game)
		.where((eb) =>
			eb.or([eb("title", "=", title), sql<boolean>`${title} = ANY(song.alt_titles)`]),
		)
		.limit(2)
		.execute();

	if (res.length === 2) {
		throw new AmbiguousTitleFailure(
			title,
			`Multiple songs exist with the title ${title}. We cannot resolve this. Please try and use a different song resolution method.`,
		);
	}

	return res[0] ? rowToSongDoc(res[0]) : null;
}

/**
 * Finds a song on a song title case-insensitively.
 * This is needed for services that provide horrifically mutated string titles.
 */
export async function FindSongOnTitleInsensitive(
	game: GameGroup,
	title: string,
	artist?: string | null,
): Promise<MONGO_SongDocument | null> {
	const titlePat = `^${EscapeStringRegexp(title)}$`;
	const artistPat = `^${EscapeStringRegexp(artist ?? "")}$`;

	let q = DB.selectFrom("song")
		.selectAll()
		.where("game_group", "=", game)
		.where((eb) =>
			eb.or([
				sql<boolean>`song.title ~* ${titlePat}`,
				sql<boolean>`EXISTS (SELECT 1 FROM unnest(song.alt_titles) AS a WHERE a ~* ${titlePat})`,
			]),
		)
		.limit(2);

	if (artist) {
		q = q.where(sql<boolean>`song.artist ~* ${artistPat}`);
	}

	const res = await q.execute();

	if (res.length === 2) {
		throw new AmbiguousTitleFailure(
			title,
			artist
				? `Multiple songs exist with the case-insensitive title ${title} by artist ${artist}. We cannot resolve this. Please try and use a different song resolution method.`
				: `Multiple songs exist with the case-insensitive title ${title}. We cannot resolve this. Please try adding an artist field.`,
		);
	}

	return res[0] ? rowToSongDoc(res[0]) : null;
}

/**
 * Finds a song document based on the Tachi songID. Depending on the database this might
 * also be the in-game-ID.
 * @param game - The game to search upon.
 * @param songID - The song ID to match.
 * @returns MONGO_SongDocument
 */
export async function FindSongOnID(game: GameGroup, songID: integer) {
	const row = await DB.selectFrom("song")
		.selectAll()
		.where("game_group", "=", game)
		.where("legacy_id", "=", songID)
		.executeTakeFirst();

	return row ? rowToSongDoc(row) : null;
}

/**
 * Find a DDR song by `data.ddrSongHash` (batch-manual `ddrSongHash`).
 */
export async function FindDDRSongOnDDRSongHash(hash: string) {
	const row = await DB.selectFrom("song")
		.selectAll()
		.where("game_group", "=", "ddr")
		.where(sql<boolean>`(song.data::jsonb->>'ddrSongHash') = ${hash}`)
		.executeTakeFirst();

	return row ? rowToSongDoc(row) : null;
}

export async function FindSongOnIDGuaranteed(game: GameGroup, songID: integer, log: KtLogger) {
	const song = await FindSongOnID(game, songID);

	if (!song) {
		log.error(`Song-Chart desync for ${songID}. Has charts, but no song.`);
		throw new InternalFailure(`Song-Chart desync for ${songID}. Has charts, but no song.`);
	}

	return song;
}
