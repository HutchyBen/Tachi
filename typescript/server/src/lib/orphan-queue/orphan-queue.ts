import type { Database, Game } from "tachi-db";

import { GetChartById } from "#lib/db-formats/chart";
import { log } from "#lib/log/log";
import DB from "#services/pg/db";
import { GetNextBmsPmsSongLegacyId } from "#utils/db";
import { DedupeArr } from "#utils/misc";
import { type Kysely, sql } from "kysely";
import {
	CreateSongID,
	type GPTString,
	type GPTStringToGame,
	type GPTStringToPlaytype,
	GPTStringToV3,
	type integer,
	type MONGO_ChartDocument,
	type MONGO_SongDocument,
} from "tachi-common";

/** Match shape used by Beatoraja BMS/PMS orphan handling (Postgres `chart_doc` JSON). */
export type OrphanQueueMatchCriteria<GPT extends GPTString> = {
	"chartDoc.data.hashSHA256"?: string;
	playtype?: GPTStringToPlaytype[GPT];
};

function parseStoredJson<T>(raw: unknown): T {
	if (typeof raw === "string") {
		return JSON.parse(raw) as T;
	}

	return raw as T;
}

async function selectOrphanByCriteria<GPT extends GPTString>(
	gptString: GPT,
	orphanMatchCriteria: OrphanQueueMatchCriteria<GPT>,
) {
	const v3Game = GPTStringToV3(gptString) as Game;

	let q = DB.selectFrom("orphan_chart")
		.select(["orphan_chart.id", "orphan_chart.chart_doc", "orphan_chart.song_doc"])
		.where("orphan_chart.game", "=", v3Game);

	const sha = orphanMatchCriteria["chartDoc.data.hashSHA256"];
	if (sha !== undefined) {
		q = q.where(sql<boolean>`(orphan_chart.chart_doc::jsonb->'data'->>'hashSHA256') = ${sha}`);
	}

	const pt = orphanMatchCriteria.playtype;
	if (pt !== undefined) {
		q = q.where(sql<boolean>`(orphan_chart.chart_doc::jsonb->>'playtype') = ${pt}`);
	}

	const row = await q.executeTakeFirst();

	if (!row) {
		return null;
	}

	const chartDoc = parseStoredJson<MONGO_ChartDocument<GPT>>(row.chart_doc);
	const songDoc = parseStoredJson<MONGO_SongDocument<GPTStringToGame[GPT]>>(row.song_doc);

	return { id: row.id, chartDoc, songDoc };
}

async function orphanUserIds(orphanChartId: string): Promise<Array<integer>> {
	const rows = await DB.selectFrom("orphan_chart_user")
		.select("user_id")
		.where("orphan_chart_id", "=", orphanChartId)
		.execute();

	return rows.map((r) => r.user_id as integer);
}

async function writeBmsPmsSongAndChart(
	trx: Kysely<Database>,
	gameGroup: "bms" | "pms",
	v3Game: Game,
	songDoc: MONGO_SongDocument<"bms" | "pms">,
	chartDoc: MONGO_ChartDocument,
	songNewID: string,
	songLegacyId: integer,
) {
	const ftsDocument = [...songDoc.searchTerms, ...songDoc.altTitles].filter(Boolean).join(" ");

	await trx
		.insertInto("song")
		.values({
			id: songNewID,
			legacy_id: songLegacyId,
			game_group: gameGroup,
			title: songDoc.title,
			artist: songDoc.artist,
			search_terms: songDoc.searchTerms,
			alt_titles: songDoc.altTitles,
			fts_document: ftsDocument,
			data: songDoc.data as object,
		})
		.execute();

	await trx
		.insertInto("chart")
		.values({
			id: chartDoc.chartID,
			legacy_id: chartDoc.chartID,
			game: v3Game,
			song_id: songNewID,
			level: chartDoc.level,
			level_num: chartDoc.levelNum,
			is_primary: chartDoc.isPrimary,
			difficulty: chartDoc.difficulty,
			versions: chartDoc.versions,
			data: chartDoc.data as object,
		})
		.execute();
}

/**
 * Handles an orphan queue request.
 *
 * If the chart has never been seen before, add it to the orphan queue
 * and return null.
 *
 * If the chart has been seen before, and has less than N unique players
 * who have played it, return null.
 *
 * If the chart has been seen before, and has >= N unique players who have
 * played it, unorphan the chart, and return it.
 */
export async function HandleOrphanQueue<GPT extends GPTString>(
	gptString: GPT,
	game: GPTStringToGame[GPT],
	chartDoc: MONGO_ChartDocument<GPT>,
	songDoc: MONGO_SongDocument<GPTStringToGame[GPT]>,
	orphanMatchCriteria: OrphanQueueMatchCriteria<GPT>,
	queueSize: integer,
	userID: integer,
	chartName: string,
) {
	log.debug(`Received orphanqueue request for ${chartName}.`);

	const v3Game = GPTStringToV3(gptString) as Game;
	const gameGroup = game as "bms" | "pms";

	const orphan = await selectOrphanByCriteria(gptString, orphanMatchCriteria);

	if (!orphan) {
		log.debug(`Received unknown chart ${chartName}, orphaning.`);

		await DB.transaction().execute(async (trx) => {
			await trx
				.insertInto("orphan_chart")
				.values({
					id: chartDoc.chartID,
					game: v3Game,
					chart_doc: chartDoc as object,
					song_doc: songDoc as object,
				})
				.execute();

			await trx
				.insertInto("orphan_chart_user")
				.values({
					orphan_chart_id: chartDoc.chartID,
					user_id: userID,
				})
				.execute();
		});

		return null;
	}

	await DB.insertInto("orphan_chart_user")
		.values({
			orphan_chart_id: orphan.id,
			user_id: userID,
		})
		.onConflict((oc) => oc.columns(["orphan_chart_id", "user_id"]).doNothing())
		.execute();

	const uniqueUsersArr = DedupeArr(await orphanUserIds(orphan.id));

	const playcount = uniqueUsersArr.length;

	// If N or more people have played this chart while orphaned, unorphan
	// it.

	if (playcount >= queueSize) {
		log.info(`Song ${chartName} was unorphaned by userIDs ${uniqueUsersArr.join(", ")}.`);

		const songLegacyId = await GetNextBmsPmsSongLegacyId(gameGroup);

		log.debug(`${chartName} has been assigned songID ${songLegacyId}.`);

		const songDocU = { ...orphan.songDoc };
		const chartDocU = { ...orphan.chartDoc };

		songDocU.id = songLegacyId;
		chartDocU.songID = songLegacyId;

		const songNewID = CreateSongID();

		await DB.transaction().execute(async (trx) => {
			await writeBmsPmsSongAndChart(
				trx,
				gameGroup,
				v3Game,
				songDocU as MONGO_SongDocument<"bms" | "pms">,
				chartDocU,
				songNewID,
				songLegacyId,
			);

			await trx
				.deleteFrom("orphan_chart_user")
				.where("orphan_chart_id", "=", orphan.id)
				.execute();

			await trx.deleteFrom("orphan_chart").where("id", "=", orphan.id).execute();
		});

		const loaded = await GetChartById(v3Game, chartDocU.chartID);

		if (!loaded) {
			log.error(
				`Orphan unorphan succeeded but GetChartById failed for ${chartDocU.chartID}.`,
			);
			return null;
		}

		return loaded as MONGO_ChartDocument<GPT>;
	}

	// otherwise, this play is recorded in orphan_chart_user; no row update needed

	log.debug(`UserID ${userID} played ${chartName}, which is now at ${playcount} plays.`);

	return null;
}

/**
 * Forcefully deorphan a song/chart if it's in the queue and matches this criteria.
 *
 * Useful for something like BMS-Table-Sync, where we want to load anything in a table
 * regardless of how many people have played the chart.
 */
export async function DeorphanIfInQueue<GPT extends GPTString>(
	gptString: GPT,
	game: GPTStringToGame[GPT],
	orphanMatchCriteria: OrphanQueueMatchCriteria<GPT>,
): Promise<MONGO_ChartDocument<GPT> | null> {
	const orphan = await selectOrphanByCriteria(gptString, orphanMatchCriteria);

	if (!orphan) {
		return null;
	}

	const v3Game = GPTStringToV3(gptString) as Game;
	const gameGroup = game as "bms" | "pms";

	const { songDoc, chartDoc } = orphan;

	log.info(`Song ${songDoc.title} was unorphaned forcefully.`);

	const songLegacyId = await GetNextBmsPmsSongLegacyId(gameGroup);

	log.debug(`${songDoc.title} has been assigned songID ${songLegacyId}.`);

	const songDocU = { ...songDoc };
	const chartDocU = { ...chartDoc };

	songDocU.id = songLegacyId;
	chartDocU.songID = songLegacyId;

	const songNewID = CreateSongID();

	await DB.transaction().execute(async (trx) => {
		await writeBmsPmsSongAndChart(
			trx,
			gameGroup,
			v3Game,
			songDocU as MONGO_SongDocument<"bms" | "pms">,
			chartDocU,
			songNewID,
			songLegacyId,
		);

		await trx
			.deleteFrom("orphan_chart_user")
			.where("orphan_chart_id", "=", orphan.id)
			.execute();

		await trx.deleteFrom("orphan_chart").where("id", "=", orphan.id).execute();
	});

	const loaded = await GetChartById(v3Game, chartDocU.chartID);

	if (!loaded) {
		log.error(`DeorphanIfInQueue succeeded but GetChartById failed for ${chartDocU.chartID}.`);
		return null;
	}

	return loaded as MONGO_ChartDocument<GPT>;
}
