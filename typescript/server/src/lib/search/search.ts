import type { FilterQuery } from "mongodb";
import type { ICollection } from "monk";

import { SELECT_USER, ToUserDocument } from "#lib/db-formats/user";
import { TachiConfig } from "#lib/setup/config";
import MONGODB_KILL from "#services/mongo/db";
import DB from "#services/pg/db";
import { GetSongForIDGuaranteed } from "#utils/db";
import { EscapeForILIKE } from "#utils/misc";
import { UnixMillisecondsToISO8601 } from "#utils/time";
import { GetOnlineCutoff } from "#utils/user";
import {
	type GameGroup,
	type GPTStrings,
	type integer,
	type MONGO_ChartDocument,
	type MONGO_FolderDocument,
	type MONGO_SessionDocument,
	type MONGO_SongDocument,
	type MONGO_UserDocument,
	type Playtype,
} from "tachi-common";

import { AsyncFzf } from "./fzf/main";
import { SearchSpecificGameSongs, type SongSearchReturn } from "./songs.js";

interface SearchControls {
	keys: Array<string>;
	primary: string;
}

const SEARCH_CONTROLS = {
	songs: {
		keys: ["title", "artist", "searchTerms", "altTitles"],
		primary: "id",
	},
	sessions: { keys: ["name"], primary: "sessionID" },
	goals: { keys: ["name"], primary: "goalID" },
	quests: { keys: ["name"], primary: "questID" },
	users: { keys: ["username"], primary: "id" },
	folders: { keys: ["title", "searchTerms"], primary: "folderID" },
} satisfies Partial<Record<keyof typeof MONGODB_KILL, SearchControls>>;

interface SearchData {
	primaryKey: number | string;
	searchKey: string;
}

/**
 * Perform a $text index search on a collection.
 *
 * This throws an error if the collection does not have a text index.
 *
 * @param existingMatch - An existing $match query to further filter results
 * by.
 */
export async function SearchCollection<T extends object>(
	collection: ICollection<T>,
	search: string,
	searchMethod: keyof typeof SEARCH_CONTROLS,
	existingMatch: FilterQuery<T> = {},
	limit = 500,
): Promise<Array<{ __textScore: number } & T>> {
	const controls = SEARCH_CONTROLS[searchMethod];

	const projection = Object.fromEntries([...controls.keys, controls.primary].map((e) => [e, 1]));

	// we do the searching in-memory, because mongodb's search offerings are truly
	// abysmal. I'm sorry. The performance is fine. I think.
	const data = (await collection.find(existingMatch, { projection })) as Array<any>;

	// instead of creating different AsyncFzf instances for each search control, we instead
	// pool everything into the same instance. this ensures that all search controls are weighted
	// equally, avoiding the case where bad results are included because all values for that search
	// control are quite bad.
	const searchData: Array<SearchData> = [];

	for (const key of controls.keys) {
		searchData.push(
			...data
				.filter((d) => d[key])
				.flatMap<SearchData>((d) => {
					// handles stuff like searchTerms or altTitles being an array
					if (Array.isArray(d[key])) {
						return d[key].map((k: any) => ({
							primaryKey: d[controls.primary],
							searchKey: k.toString(),
						}));
					}

					return [
						{
							primaryKey: d[controls.primary],
							searchKey: d[key].toString(),
						},
					];
				}),
		);
	}

	// we don't use fzf's limit since our best results may include duplicates,
	// e.g. "gravekeeper" might match both the search terms "Gravekeeper" and
	// "Gravekeeper of the Dead Tree" from the same song. The library doesn't do
	// anything special with the option anyways; it still runs through all results
	// but simply remove excess items before returning it to us.
	const fzf = new AsyncFzf(searchData, {
		selector: (item) => item.searchKey,
		sort: true,
		casing: "case-insensitive",
	});
	let results = await fzf.find(search);

	// filter out anything far from the best match
	// 30 was chosen arbitrarily :)
	const max = results[0]?.score ?? 0;

	results = results.filter((r) => r.score >= max - 30);

	const pkeys: Set<number | string> = new Set();
	const scores: Record<string, number> = {};

	for (const res of results) {
		const pkey = res.item.primaryKey;
		const existingScore = scores[pkey];

		pkeys.add(pkey);

		if (!existingScore || res.score > existingScore) {
			scores[pkey] = res.score;
		}

		if (pkeys.size > limit) {
			break;
		}
	}

	const documents: Array<any> = await (collection as ICollection).find({
		[controls.primary]: { $in: Array.from(pkeys) },
	});

	// however, the results we get back from MongoDB are unordered, so we have to sort again.
	documents.sort(
		(a, b) => (scores[b[controls.primary]] ?? 0) - (scores[a[controls.primary]] ?? 0),
	);

	for (const doc of documents) {
		doc.__textScore = scores[doc[controls.primary]] ?? 0;
	}

	return documents;
}

export function SearchSessions(
	search: string,
	game?: GameGroup,
	playtype?: Playtype,
	userID?: integer,
	limit = 100,
) {
	const baseMatch: FilterQuery<MONGO_SessionDocument> = {};

	if (game) {
		baseMatch.game = game;
	}

	if (playtype) {
		baseMatch.playtype = playtype;
	}

	if (userID !== undefined) {
		baseMatch.userID = userID;
	}

	return SearchCollection(MONGODB_KILL.sessions, search, "sessions", baseMatch, limit);
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
export async function SearchAllGamesSongs(search: string) {
	return SearchGamesSongs(search, TachiConfig.GAMES);
}

export async function SearchGamesSongs(search: string, games: Array<GameGroup>) {
	const promises = [];

	for (const game of games) {
		promises.push(SearchAllGamesSingleGame(game, search));
	}

	const res = await Promise.all(promises);

	return res.flat(1).sort((a, b) => b.__textScore - a.__textScore);
}

export async function SearchForChartHash(search: string) {
	const results = await Promise.all([
		MONGODB_KILL.charts.bms.find({
			$or: [{ "data.hashMD5": search }, { "data.hashSHA256": search }],
		}),
		MONGODB_KILL.charts.pms.find({
			$or: [{ "data.hashMD5": search }, { "data.hashSHA256": search }],
		}),
		MONGODB_KILL.charts.usc.find({ "data.hashSHA1": search }),
		MONGODB_KILL.charts.itg.find({ "data.hashGSv3": search }),
	]);

	const [bmsCharts, pmsCharts, uscCharts, itgCharts] = results;

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
	limit?: integer,
) {
	return SearchCollection(MONGODB_KILL.folders, search, "folders", existingMatch, limit);
}
