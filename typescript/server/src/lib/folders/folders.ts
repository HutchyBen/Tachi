import type { Kysely } from "kysely";
import type { FilterQuery } from "mongodb";
import type { Database } from "tachi-db";

import { SELECT_CHART, ToChartDocument } from "#lib/db-formats/chart";
import { GetSongsByLegacyIDs } from "#lib/db-formats/song";
import { log } from "#lib/log/log";
import MONGODB_KILL from "#services/mongo/db";
import DB from "#services/pg/db.js";
import { GetFolderForIDGuaranteed } from "#utils/db";
import fjsh from "fast-json-stable-hash";
import {
	FormatGameGroup,
	type GameGroup,
	GetGamePTConfig,
	GetScoreEnumConfs,
	GetScoreMetrics,
	type integer,
	type MONGO_ChartDocument,
	type MONGO_FolderDocument,
	type MONGO_PBScoreDocument,
	type MONGO_SongDocument,
	type MONGO_TableDocument,
	type Playtype,
} from "tachi-common";

import {
	BuildFolderQuery as BuildFolderQueryImpl,
	GetFolderChartIDs as GetFolderChartIDsImpl,
} from "./folder-query.js";
/** Loads charts for a folder using `folder_chart_lookup` + `chart` / `song` joins. */
export async function GetFolderCharts(
	folder: MONGO_FolderDocument,
	_filter: FilterQuery<MONGO_ChartDocument> = {},
): Promise<{ charts: Array<MONGO_ChartDocument> }> {
	const chartIds = await GetFolderChartIDs(folder.folderID);

	if (chartIds.length === 0) {
		return { charts: [] };
	}

	const rows = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select([...SELECT_CHART, "song.legacy_id as song_legacy_id"])
		.where("chart.id", "in", chartIds)
		.execute();

	const charts = rows.map((row) => ToChartDocument(row, row.song_legacy_id));

	return { charts };
}

export async function GetFolderChartsAndSongs(
	folder: MONGO_FolderDocument,
	filter: FilterQuery<MONGO_ChartDocument> = {},
): Promise<{ charts: Array<MONGO_ChartDocument>; songs: Array<MONGO_SongDocument> }> {
	const { charts } = await GetFolderCharts(folder, filter);

	const legacyIds = [...new Set(charts.map((e) => e.songID))];
	const songs = await GetSongsByLegacyIDs(folder.game, legacyIds);

	return { songs, charts };
}

export function BuildFolderQuery(folderID: string, db: Kysely<Database> = DB) {
	return BuildFolderQueryImpl(folderID, db);
}

export function GetFolderChartIDs(folderID: string, db: Kysely<Database> = DB) {
	return GetFolderChartIDsImpl(folderID, db);
}

/**
 * Folders that contain this chart (from `folder_chart_lookup`). Run
 * {@link rebuildFolderChartLookup} to keep the table populated.
 */
export async function GetFolderIDsForChartId(chartId: string, db: Kysely<Database> = DB) {
	const rows = await db
		.selectFrom("folder_chart_lookup")
		.select("folder_chart_lookup.folder_id")
		.where("folder_chart_lookup.chart_id", "=", chartId)
		.execute();

	return rows.map((r) => r.folder_id);
}

export async function GetFoldersFromTable(table: MONGO_TableDocument) {
	const folders = await MONGODB_KILL.folders.find({
		folderID: { $in: table.folders },
	});

	if (folders.length !== table.folders.length) {
		// this is an error, but we can return anyway.
		log.warn(
			`Table ${table.tableID} has a mismatch of real folders to stored folders. ${table.folders.length} -> ${folders.length}`,
		);
	}

	// we also need to sort folders in their indexed order.
	folders.sort((a, b) => table.folders.indexOf(a.folderID) - table.folders.indexOf(b.folderID));

	return folders;
}

/**
 * Get the names of all the folders in a Tachi Table in-order.
 */
export async function GetFolderNamesInOrder(table: MONGO_TableDocument): Promise<Array<string>> {
	const folders = await GetFoldersFromTable(table);

	// we have to iterate over these folders in the order the table document says
	// to
	// as bms tables are somewhat sensitive to being placed in the correct order.
	const folderMap = new Map<string, MONGO_FolderDocument>();

	for (const folder of folders) {
		folderMap.set(folder.folderID, folder);
	}

	const orderedNames = [];

	for (const folderID of table.folders) {
		const folder = folderMap.get(folderID);

		if (!folder) {
			log.warn(
				`Table '${table.title}' refers to folder '${folderID}', but no such folder exists? Ignoring.`,
			);
			continue;
		}

		orderedNames.push(folder.title);
	}

	return orderedNames;
}

export async function GetPBsOnFolder(userID: integer, folder: MONGO_FolderDocument) {
	const { charts, songs } = await GetFolderChartsAndSongs(folder, {});

	const pbs = await MONGODB_KILL["personal-bests"].find({
		userID,
		chartID: { $in: charts.map((e) => e.chartID) },
	});

	return { pbs, charts, songs };
}

/**
 * Get the distribution for this all gpt enums for this user on this folder.
 */
export async function GetEnumDistForFolder(userID: integer, folder: MONGO_FolderDocument) {
	const pbData = await GetPBsOnFolder(userID, folder);

	const gptConfig = GetGamePTConfig(folder.game, folder.playtype);

	const enumMetrics = GetScoreMetrics(gptConfig, "ENUM");

	const allEnumDists: Record<string, Record<string, integer>> = {};

	for (const metric of enumMetrics) {
		allEnumDists[metric] = GetEnumDist(pbData.pbs, metric);
	}

	const chartIDs = await GetFolderChartIDs(folder.folderID);

	return { folderID: folder.folderID, chartCount: chartIDs.length, stats: allEnumDists };
}

/**
 * Get the distribution for this all gpt enums for this user on all these folders.
 */
export function GetEnumDistForFolders(userID: integer, folders: Array<MONGO_FolderDocument>) {
	return Promise.all(folders.map((folder) => GetEnumDistForFolder(userID, folder)));
}

function GetEnumDist(pbs: Array<MONGO_PBScoreDocument>, enumMetric: string) {
	const enumDist: Record<string, integer> = {};

	for (const pb of pbs) {
		// @ts-expect-error hacky string types, be careful.
		const enumValue = pb.scoreData[enumMetric];

		if (enumDist[enumValue] !== undefined) {
			enumDist[enumValue]++;
		} else {
			enumDist[enumValue] = 1;
		}
	}

	return enumDist;
}

export function CreateFolderID(
	query: Record<string, unknown>,
	game: GameGroup,
	playtype: Playtype,
) {
	return `F${fjsh.hash({ game, playtype, ...query }, "SHA256")}`;
}

export async function GetRecentlyViewedFolders(
	userID: integer,
	game: GameGroup,
	playtype: Playtype,
) {
	const views = await MONGODB_KILL["recent-folder-views"].find(
		{
			userID,
			game,
			playtype,
		},
		{
			sort: {
				lastViewed: -1,
			},
			limit: 6,
		},
	);

	if (views.length === 0) {
		return { views, folders: [] };
	}

	const folders = await MONGODB_KILL.folders.find({
		folderID: { $in: views.map((e) => e.folderID) },
	});

	return { views, folders };
}

export async function GetTableForIDGuaranteed(tableID: string): Promise<MONGO_TableDocument> {
	const table = await MONGODB_KILL.tables.findOne({ tableID });

	if (!table) {
		throw new Error(`Couldn't find table with ID '${tableID}'.`);
	}

	return table;
}

/**
 * Long function name. Wew.
 *
 * Get the grade, lamp, etc. distribution for a user on a folder before the given time.
 * So for example, you want to know how many AAAs/HARD CLEARs a user had on a folder
 * before Jan 1st 2022.
 *
 * This is used to calculate folder raises.
 */
export async function GetEnumDistForFolderAsOf(
	userID: integer,
	folderID: string,
	beforeTime: number,
) {
	const chartIDs = await GetFolderChartIDs(folderID);
	const folder = await GetFolderForIDGuaranteed(folderID);
	const { game, playtype } = folder;

	const gptConfig = GetGamePTConfig(folder.game, folder.playtype);

	const groupOn: any = {};

	const enumMetrics = GetScoreEnumConfs(gptConfig);

	for (const met of Object.keys(enumMetrics)) {
		groupOn[met] = { $max: `$scoreData.enumIndexes.${met}` };
	}

	const bestEnumIndexes: Array<{ _id: string } & Record<string, integer>> =
		await MONGODB_KILL.scores.aggregate([
			{
				$match: {
					chartID: { $in: chartIDs },
					userID,
					// we deliberately use not gte as that includes null
					// rather than "lt" which skips over null.
					timeAdded: { $not: { $gte: beforeTime } },
				},
			},
			{
				$group: {
					_id: "$chartID",
					...groupOn,
				},
			},
		]);

	const enumDist: Record<string, Record<string, integer>> = {};
	const cumulativeEnumDist: Record<string, Record<string, integer>> = {};

	for (const [metric, conf] of Object.entries(enumMetrics)) {
		const thisEnumDist: Record<string, integer> = {};
		const thisCumulativeEnumDist: Record<string, integer> = {};

		for (const score of bestEnumIndexes) {
			const val = conf.values[score[metric] ?? -1];

			if (!val) {
				log.warn(
					`Failed to resolve ${metric} index '${score[metric]}' for ${FormatGameGroup(
						game,
						playtype,
					)}.`,
				);
				continue;
			}

			if (thisEnumDist[val] !== undefined) {
				thisEnumDist[val]++;
			} else {
				thisEnumDist[val] = 1;
			}

			const end = score[metric]! + 1;

			// for the cumulative dist, count up until this metric; inclusive
			for (const val of conf.values.slice(0, end)) {
				if (thisCumulativeEnumDist[val] !== undefined) {
					thisCumulativeEnumDist[val]++;
				} else {
					thisCumulativeEnumDist[val] = 1;
				}
			}
		}

		enumDist[metric] = thisEnumDist;
		cumulativeEnumDist[metric] = thisCumulativeEnumDist;
	}

	return {
		enumDist,
		cumulativeEnumDist,
		chartIDs,
		folder,
	};
}
