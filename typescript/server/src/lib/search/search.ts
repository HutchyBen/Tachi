import type { FilterQuery } from "mongodb";

import { SELECT_USER, ToUserDocument } from "#lib/db-formats/user";
import { TachiConfig } from "#lib/setup/config";
import DB from "#services/pg/db";
import { GetSongForIDGuaranteed } from "#utils/db";
import { EscapeForILIKE } from "#utils/misc";
import {
	FindBMSChartsByHashMd5OrSha256,
	FindITGChartsByHashGSv3,
	FindPMSChartsByHashMd5OrSha256,
	FindUSCChartsByHashSHA1,
} from "#utils/queries/charts";
import { UnixMillisecondsToISO8601 } from "#utils/time";
import { GetOnlineCutoff } from "#utils/user";
import {
	type GameGroup,
	GamePTToV3,
	type GPTStrings,
	type integer,
	type MONGO_ChartDocument,
	type MONGO_FolderDocument,
	type MONGO_SongDocument,
	type MONGO_UserDocument,
	type Playtype,
} from "tachi-common";
import { type Game } from "tachi-db";

import { SearchFoldersFtsAndTrgmGlobal } from "./folders.js";
import { type SearchSessionHit, SearchSessionsForUserGptFtsAndTrgm } from "./session-search.js";
import { SearchSpecificGameSongs, type SongSearchReturn } from "./songs.js";

export type { SearchSessionHit } from "./session-search.js";

export function SearchSessions(
	search: string,
	game?: GameGroup,
	playtype?: Playtype,
	userID?: integer,
	limit = 100,
): Promise<Array<SearchSessionHit>> {
	if (game === undefined || playtype === undefined || userID === undefined) {
		return Promise.resolve([]);
	}

	const v3Game = GamePTToV3(game, playtype) as Game;

	return SearchSessionsForUserGptFtsAndTrgm(userID, v3Game, search, limit);
}

/**
 * Searches the user collection for users that are *like* the
 * provided string.
 *
 * We use regex matching because $text matches words, and users
 * aren't allowed spaces in their name. In short, $text is very
 * poor at actually matching usernames.
 */
export function SearchUsersRegExp(
	search: string,
	matchOnline = false,
): Promise<Array<MONGO_UserDocument>> {
	const likeEsc = EscapeForILIKE(search.toLowerCase());

	const onlineCutoff = UnixMillisecondsToISO8601(GetOnlineCutoff());

	let q = DB.selectFrom("account")
		.select(SELECT_USER)
		.where("normalized_username", "like", `%${likeEsc}%`);

	if (matchOnline) {
		q = q.where("last_seen", ">", onlineCutoff);
	}

	return q
		.limit(25)
		.execute()
		.then((res) => res.map(ToUserDocument));
}

/**
 * Terrible function name!
 * Searches a single game, but optimised for the searchAllGames return.
 */
async function SearchAllGamesSingleGame(game: GameGroup, search: string) {
	const songs = (await SearchSpecificGameSongs(game, search, 10)) as Array<
		{
			game: GameGroup;
		} & SongSearchReturn
	>;

	for (const song of songs) {
		song.game = game;
	}

	return songs;
}

/**
 * Searches all games' songs.
 */
export async function SearchGamesSongs(search: string, games: Array<GameGroup> | null) {
	const promises = [];

	for (const game of games ?? TachiConfig.GAMES) {
		promises.push(SearchAllGamesSingleGame(game, search));
	}

	const res = await Promise.all(promises);

	return res.flat(1).sort((a, b) => b.__textScore - a.__textScore);
}

export async function SearchForChartHash(search: string) {
	const [bmsCharts, pmsCharts, uscCharts, itgCharts] = await Promise.all([
		FindBMSChartsByHashMd5OrSha256(search),
		FindPMSChartsByHashMd5OrSha256(search),
		FindUSCChartsByHashSHA1(search),
		FindITGChartsByHashGSv3(search),
	]);

	const output: Record<
		GPTStrings["bms" | "itg" | "pms" | "usc"],
		Array<{
			chart: MONGO_ChartDocument;
			playcount: null;
			song: MONGO_SongDocument;
		}>
	> = {
		"bms:7K": [],
		"bms:14K": [],
		"pms:Controller": [],
		"pms:Keyboard": [],
		"usc:Controller": [],
		"usc:Keyboard": [],
		"itg:Stamina": [],
	};

	const zip = [
		["bms", bmsCharts],
		["pms", pmsCharts],
		["itg", itgCharts],
		["usc", uscCharts],
	] as const;

	for (const [game, charts] of zip) {
		for (const chart of charts as Array<MONGO_ChartDocument>) {
			const song = await GetSongForIDGuaranteed(game, chart.songID);

			// @ts-expect-error ts doesn't like this hack but it'll work.
			output[`${game}:${chart.playtype}`]!.push({
				song,
				chart,
				playcount: null,
			});
		}
	}

	return output;
}

export function SearchFolders(
	search: string,
	existingMatch?: FilterQuery<MONGO_FolderDocument>,
	limit = 500,
): Promise<Array<{ __textScore: number } & MONGO_FolderDocument>> {
	const gameIn = existingMatch?.game as { $in?: Array<GameGroup> } | undefined;
	const playtypeIn = existingMatch?.playtype as { $in?: Array<Playtype> } | undefined;

	if (gameIn?.$in !== undefined && playtypeIn?.$in !== undefined) {
		return SearchFoldersFtsAndTrgmGlobal(search, {
			limit,
			games: gameIn.$in,
			playtypes: playtypeIn.$in,
		});
	}

	return SearchFoldersFtsAndTrgmGlobal(search, { limit });
}
