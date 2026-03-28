import { GetChartsBySongPgId } from "#lib/db-formats/chart";
import DB from "#services/pg/db";
import { sql } from "kysely";
import {
	type GameGroup,
	GamePTToV3,
	type GPTString,
	type integer,
	type MONGO_ChartDocument,
	type MONGO_SongDocument,
	MongoChartLegacyId,
	type Playtype,
	SplitGPT,
} from "tachi-common";

import { MAX_SONG_SEARCH_RESULTS_PER_GAME, searchSpecificGameSongsWithPgIds } from "./songs.js";

export async function SearchSpecificGameSongsAndCharts(
	game: GameGroup,
	search: string,
	playtype?: Playtype,
	limit = 100,
) {
	const { songs, pgIdByLegacyId } = await searchSpecificGameSongsWithPgIds(game, search, limit);

	if (!playtype) {
		throw new Error("SearchSpecificGameSongsAndCharts requires playtype");
	}

	const v3Game = GamePTToV3(game, playtype);

	const chartLists = await Promise.all(
		songs.map((song) => {
			const pgId = pgIdByLegacyId.get(song.id);

			if (!pgId) {
				return Promise.resolve([] as Array<MONGO_ChartDocument>);
			}

			return GetChartsBySongPgId(v3Game, pgId, song.id, {
				omit2dxtraCharts: game === "iidx",
			});
		}),
	);

	const charts = chartLists.flat();

	return { songs, charts };
}

/**
 * Search this Game/GPTs songs and charts, but globally.
 *
 * Returns at most `limit` **chart** rows per GPT (same cap as song search). Without this,
 * N matched songs × charts per song could return a huge payload from `/api/v1/search`.
 */
export async function SearchGlobalGameSongsAndCharts(
	game: GameGroup,
	search: string,
	playtype?: Playtype,
	limit = MAX_SONG_SEARCH_RESULTS_PER_GAME,
): Promise<Array<{ chart: MONGO_ChartDocument; playcount: integer; song: MONGO_SongDocument }>> {
	const { songs, pgIdByLegacyId } = await searchSpecificGameSongsWithPgIds(game, search, limit);

	if (!playtype) {
		throw new Error("SearchGlobalGameSongsAndCharts requires playtype");
	}

	const v3Game = GamePTToV3(game, playtype);

	const output: Array<{
		chart: MONGO_ChartDocument;
		playcount: integer;
		song: MONGO_SongDocument;
	}> = [];

	for (const song of songs) {
		if (output.length >= limit) {
			break;
		}

		const pgId = pgIdByLegacyId.get(song.id);

		if (!pgId) {
			continue;
		}

		// eslint-disable-next-line no-await-in-loop -- stop after enough charts; avoids loading every song's charts when the cap is already reached.
		const songCharts = await GetChartsBySongPgId(v3Game, pgId, song.id, {
			omit2dxtraCharts: game === "iidx",
		});

		for (const chart of songCharts) {
			if (output.length >= limit) {
				break;
			}

			output.push({
				song,
				chart,
				playcount: 0,
			});
		}
	}

	if (output.length === 0) {
		return [];
	}

	const chartLegacyIds = output.map((o) => MongoChartLegacyId(o.chart));

	const playcountRows = await DB.selectFrom("score")
		.innerJoin("chart", "chart.id", "score.chart_id")
		.select(["chart.legacy_id", sql<number>`count(score.id)::int`.as("playcount")])
		.where("chart.legacy_id", "in", chartLegacyIds)
		.groupBy("chart.legacy_id")
		.execute();

	const playcountLookup = Object.fromEntries(
		playcountRows.map((r) => [r.legacy_id, r.playcount]),
	);

	for (const row of output) {
		row.playcount = playcountLookup[MongoChartLegacyId(row.chart)] ?? 0;
	}

	return output;
}

export async function SearchGamesSongsCharts(search: string, gpts: Array<GPTString>) {
	const promises = [];

	const results: Partial<
		Record<
			GPTString,
			Array<{ chart: MONGO_ChartDocument; playcount: integer; song: MONGO_SongDocument }>
		>
	> = {};

	for (const gpt of gpts) {
		const [game, playtype] = SplitGPT(gpt);

		promises.push(
			SearchGlobalGameSongsAndCharts(game, search, playtype).then((res) => {
				results[gpt] = res;
			}),
		);
	}

	await Promise.all(promises);

	return results;
}
