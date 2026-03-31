import type { Game } from "tachi-db";

import { GetChartById } from "#lib/db-formats/chart";
import { log } from "#lib/log/log";
import DB from "#services/pg/db";
import { GetNextBmsPmsSongLegacyId } from "#utils/db";
import { sql } from "kysely";
import {
	CreateSongID,
	GamePTToV3,
	type MONGO_ChartDocument,
	type MONGO_SongDocument,
	type Playtypes,
} from "tachi-common";

function parseStoredJson<T>(raw: unknown): T {
	if (typeof raw === "string") {
		return JSON.parse(raw) as T;
	}

	return raw as T;
}

/**
 * Forcefully de-orphan a BMS song/chart from `orphan_chart` when it matches a hash,
 * inserting into `song` / `chart` in Postgres. Used by BMS table sync (and tests).
 */
export async function DeorphanBmsIfInOrphanChartPg(
	playtype: Playtypes["bms"],
	checksumType: "md5" | "sha256",
	value: string,
): Promise<MONGO_ChartDocument<"bms:7K" | "bms:14K"> | null> {
	const v3Game = GamePTToV3("bms", playtype) as Game;

	const hashMatch =
		checksumType === "md5"
			? sql<boolean>`(orphan_chart.chart_doc::jsonb->'data'->>'hashMD5') = ${value}`
			: sql<boolean>`(orphan_chart.chart_doc::jsonb->'data'->>'hashSHA256') = ${value}`;

	const orphanRow = await DB.selectFrom("orphan_chart")
		.select(["orphan_chart.id", "orphan_chart.chart_doc", "orphan_chart.song_doc"])
		.where("orphan_chart.game", "=", v3Game)
		.where(hashMatch)
		.executeTakeFirst();

	if (!orphanRow) {
		return null;
	}

	const chartDoc = parseStoredJson<MONGO_ChartDocument<"bms:7K" | "bms:14K">>(
		orphanRow.chart_doc,
	);
	const songDoc = parseStoredJson<MONGO_SongDocument<"bms">>(orphanRow.song_doc);

	log.info(`Song ${songDoc.title} was unorphaned forcefully (Postgres).`);

	const songLegacyId = await GetNextBmsPmsSongLegacyId("bms");
	const songPgId = CreateSongID();

	songDoc.id = songLegacyId;
	chartDoc.songID = songLegacyId;

	const ftsDocument = [...songDoc.searchTerms, ...songDoc.altTitles].filter(Boolean).join(" ");

	await DB.transaction().execute(async (trx) => {
		await trx
			.insertInto("song")
			.values({
				id: songPgId,
				legacy_id: songLegacyId,
				game_group: "bms",
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
				song_id: songPgId,
				level: chartDoc.level,
				level_num: chartDoc.levelNum,
				is_primary: chartDoc.isPrimary,
				difficulty: chartDoc.difficulty,
				versions: chartDoc.versions,
				data: chartDoc.data as object,
			})
			.execute();

		await trx
			.deleteFrom("orphan_chart_user")
			.where("orphan_chart_id", "=", orphanRow.id)
			.execute();

		await trx.deleteFrom("orphan_chart").where("id", "=", orphanRow.id).execute();
	});

	const loaded = await GetChartById(v3Game, chartDoc.chartID);

	if (!loaded) {
		log.error(`Deorphan succeeded but GetChartById failed for ${chartDoc.chartID}.`);
		return null;
	}

	return loaded as MONGO_ChartDocument<"bms:7K" | "bms:14K">;
}
