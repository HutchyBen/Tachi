import type { ChartDocument, GameGroup, SongDocument } from "tachi-common";

/* eslint-disable no-await-in-loop */
import { MakeAction } from "#lib/actions/actions";
import { SELECT_CHART, ToChartDocument } from "#lib/db-formats/chart";
import { SELECT_SONG_DOCUMENT, ToSongDocument } from "#lib/db-formats/song";
import { log } from "#lib/log/log";
import { PullDatabaseSeeds } from "#lib/seeds/repo";
import DB from "#services/pg/db";
import { IsUserAdmin } from "#utils/user";
import { ExpectedErr } from "bliss";

async function loadAllSongsForGame(game: GameGroup): Promise<Array<SongDocument>> {
	const out = await DB.selectFrom("song")
		.select(SELECT_SONG_DOCUMENT)
		.where("game_group", "=", game)
		.orderBy("id", "asc")
		.execute()
		.then((r) => r.map(ToSongDocument));

	return out;
}

async function loadAllChartsForGame(game: GameGroup): Promise<Array<ChartDocument>> {
	const out = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.where("song.game_group", "=", game)
		.orderBy("chart.id", "asc")
		.execute()
		.then((r) => r.map(ToChartDocument));

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
