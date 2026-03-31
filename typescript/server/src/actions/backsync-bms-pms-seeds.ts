import type { GameGroup, MONGO_ChartDocument, MONGO_SongDocument } from "tachi-common";

/* eslint-disable no-await-in-loop */
import { MakeAction } from "#lib/actions/actions.js";
import { SELECT_CHART, ToChartDocument } from "#lib/db-formats/chart.js";
import { SELECT_SONG_DOCUMENT, ToSongDocument } from "#lib/db-formats/song.js";
import { log } from "#lib/log/log.js";
import { PullDatabaseSeeds } from "#lib/seeds/repo";
import DB from "#services/pg/db.js";
import { IsUserAdmin } from "#utils/user.js";
import { ExpectedErr } from "bliss";

const FETCH_CHUNK = 3_000;

async function loadAllSongsForGame(game: GameGroup): Promise<Array<MONGO_SongDocument>> {
	const out: Array<MONGO_SongDocument> = [];
	let lastLegacy: number | undefined;

	for (;;) {
		let q = DB.selectFrom("song")
			.select(SELECT_SONG_DOCUMENT)
			.where("game_group", "=", game)
			.orderBy("legacy_id", "asc")
			.limit(FETCH_CHUNK);

		if (lastLegacy !== undefined) {
			q = q.where("legacy_id", ">", lastLegacy);
		}

		const rows = await q.execute();

		if (rows.length === 0) {
			break;
		}

		for (const row of rows) {
			out.push(ToSongDocument(row));
		}

		lastLegacy = rows[rows.length - 1]!.song_legacy_id;
	}

	return out;
}

async function loadAllChartsForGame(game: GameGroup): Promise<Array<MONGO_ChartDocument>> {
	const out: Array<MONGO_ChartDocument> = [];
	let lastChartId: string | undefined;

	for (;;) {
		let q = DB.selectFrom("chart")
			.innerJoin("song", "song.id", "chart.song_id")
			.select(SELECT_CHART)
			.select("song.legacy_id as song_legacy_id")
			.where("song.game_group", "=", game)
			.orderBy("chart.id", "asc")
			.limit(FETCH_CHUNK);

		if (lastChartId !== undefined) {
			q = q.where("chart.id", ">", lastChartId);
		}

		const rows = await q.execute();

		if (rows.length === 0) {
			break;
		}

		for (const row of rows) {
			out.push(ToChartDocument(row, row.song_legacy_id));
		}

		lastChartId = rows[rows.length - 1]!.chart_id;
	}

	return out;
}

/**
 * Writes live BMS/PMS songs and charts from Postgres into the seeds repo and commits.
 */
export async function runBacksyncBmsPmsSeedsCore() {
	const repo = await PullDatabaseSeeds();

	try {
		for (const game of ["bms", "pms"] as const) {
			log.info(`Fetching ${game} songs from DB.`);

			{
				const songs = await loadAllSongsForGame(game);
				log.info(`Found ${songs.length} ${game} songs.`);
				await repo.WriteCollection(`songs-${game}`, songs);
			}

			log.info(`Fetching ${game} charts from DB.`);

			{
				const charts = await loadAllChartsForGame(game);
				log.info(`Found ${charts.length} ${game} charts.`);
				await repo.WriteCollection(`charts-${game}`, charts);
			}
		}

		await repo.CommitChangesBack(`Backsync BMS+PMS Songs/Charts ${new Date().toISOString()}`);
	} finally {
		await repo.Destroy();
	}
}

export const ACTION_BacksyncBmsPmsSeeds = MakeAction(
	"BACKSYNC_BMS_PMS_SEEDS",
	async (taker, _input) => {
		if (!(await IsUserAdmin(taker.acct.id))) {
			throw new ExpectedErr(403, "You are not authorized to perform this action.");
		}

		await runBacksyncBmsPmsSeedsCore();
		return {};
	},
);
