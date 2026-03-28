import type { KtLogger } from "#lib/log/log";
import type { FindOneResult } from "monk";
import type { GameGroup, integer, MONGO_SongDocument } from "tachi-common";

import {
	AmbiguousTitleFailure,
	InternalFailure,
} from "#lib/score-import/framework/common/converter-failures";
import MONGODB_KILL from "#services/mongo/db";

import { EscapeStringRegexp } from "../misc";

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
	// @optimisable: Performance should be tested here by having a utility field for all-titles.
	const res = await MONGODB_KILL.anySongs[game].find(
		{
			$or: [
				{
					title,
				},
				{
					altTitles: title,
				},
			],
		},
		{
			limit: 2,
		},
	);

	if (res.length === 2) {
		throw new AmbiguousTitleFailure(
			title,
			`Multiple songs exist with the title ${title}. We cannot resolve this. Please try and use a different song resolution method.`,
		);
	}

	return res[0] ?? null;
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
	// @optimisable: Performance should be tested here by having a utility field for all-titles.

	const regexTitle = new RegExp(`^${EscapeStringRegexp(title)}$`, "iu");
	const regexArtist = new RegExp(`^${EscapeStringRegexp(artist ?? "")}$`, "iu");

	const res = await MONGODB_KILL.anySongs[game].find(
		{
			$and: [
				{
					$or: [
						{
							title: { $regex: regexTitle },
						},
						{
							altTitles: { $regex: regexTitle },
						},
					],
				},
				artist
					? {
							artist: { $regex: regexArtist },
						}
					: {},
			],
		},
		{
			limit: 2,
		},
	);

	if (res.length === 2) {
		throw new AmbiguousTitleFailure(
			title,
			artist
				? `Multiple songs exist with the case-insensitive title ${title} by artist ${artist}. We cannot resolve this. Please try and use a different song resolution method.`
				: `Multiple songs exist with the case-insensitive title ${title}. We cannot resolve this. Please try adding an artist field.`,
		);
	}

	return res[0] ?? null;
}

/**
 * Finds a song document based on the Tachi songID. Depending on the database this might
 * also be the in-game-ID.
 * @param game - The game to search upon.
 * @param songID - The song ID to match.
 * @returns MONGO_SongDocument
 */
export function FindSongOnID(
	game: GameGroup,
	songID: integer,
): Promise<FindOneResult<MONGO_SongDocument>> {
	return MONGODB_KILL.anySongs[game].findOne({
		id: songID,
	});
}

export async function FindSongOnIDGuaranteed(game: GameGroup, songID: integer, log: KtLogger) {
	const song = await FindSongOnID(game, songID);

	if (!song) {
		log.error(`Song-Chart desync for ${songID}. Has charts, but no song.`);
		throw new InternalFailure(`Song-Chart desync for ${songID}. Has charts, but no song.`);
	}

	return song;
}
