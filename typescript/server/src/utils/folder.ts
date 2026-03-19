import type { BulkWriteOperation, FilterQuery } from "mongodb";

import { log } from "#lib/log/log.js";
import { TachiConfig } from "#lib/setup/config";
import MONGODB_KILL from "#services/mongo/db";
import deepmerge from "deepmerge";
import fjsh from "fast-json-stable-hash";
import {
	type ChartDocument,
	type FolderChartLookup,
	type FolderDocument,
	FormatGameGroup,
	type GameGroup,
	GetGamePTConfig,
	GetScoreEnumConfs,
	GetScoreMetrics,
	type integer,
	type PBScoreDocument,
	type Playtype,
	type SongDocument,
	type TableDocument,
} from "tachi-common";

import { GetFolderForIDGuaranteed } from "./db";

// overloads!

export async function ResolveFolderToCharts(
	folder: FolderDocument,
	filter: FilterQuery<ChartDocument>,
	getSongs: true,
): Promise<{ charts: Array<ChartDocument>; songs: Array<SongDocument> }>;
export async function ResolveFolderToCharts(
	folder: FolderDocument,
	filter?: FilterQuery<ChartDocument>,
	getSongs?: false,
): Promise<{ charts: Array<ChartDocument> }>;
export async function ResolveFolderToCharts(
	folder: FolderDocument,
	filter: FilterQuery<ChartDocument> = {},
	getSongs = false,
): Promise<{ charts: Array<ChartDocument>; songs?: Array<SongDocument> }> {
	let songs: Array<SongDocument> | null = null;
	let charts: Array<ChartDocument>;

	switch (folder.type) {
		case "static": {
			charts = await MONGODB_KILL.anyCharts[folder.game].find(
				deepmerge(filter, {
					// Specifying playtype is mandatory, don't want to catch other charts.
					playtype: folder.playtype,
					chartID: { $in: folder.data },
				}),
			);
			break;
		}

		case "songs": {
			songs = await MONGODB_KILL.anySongs[folder.game].find(folder.data);

			charts = await MONGODB_KILL.anyCharts[folder.game].find(
				deepmerge(filter, {
					playtype: folder.playtype,
					songID: { $in: songs.map((e) => e.id) },
				}),
			);
			break;
		}

		case "charts": {
			const folderDataTransposed = TransposeFolderData(folder.data);

			log.debug(
				{
					folder,
					folderDataTransposed,
				},
				`Transposed folder data in resolve-folder-to-charts.`,
			);

			const fx = deepmerge.all([filter, { playtype: folder.playtype }, folderDataTransposed]);

			charts = await MONGODB_KILL.anyCharts[folder.game].find(fx);
			break;
		}
	}

	if (getSongs) {
		if (songs) {
			return { songs, charts };
		}

		songs = await MONGODB_KILL.anySongs[folder.game].find({
			id: { $in: charts.map((e) => e.songID) },
		});

		return { songs, charts };
	}

	return { charts };
}

/**
 * Replace all ¬'s in key names with ., and all ~'s with $.
 * This is to get around the fact that you cannot store these values in mongo,
 * and we are doing reflective querying.
 */
export function TransposeFolderData(obj: Record<string, unknown>) {
	const transposedObj: Record<string, unknown> = {};

	for (const key of Object.keys(obj)) {
		const transposedKey = key.replace(/~/gu, "$").replace(/¬/gu, ".");

		if (
			typeof obj[key] === "object" &&
			!Array.isArray(obj[key]) &&
			(obj[key] as object | null)
		) {
			transposedObj[transposedKey] = TransposeFolderData(obj[key] as Record<string, unknown>);
		} else {
			transposedObj[transposedKey] = obj[key];
		}
	}

	return transposedObj;
}

export async function GetFolderCharts(
	folder: FolderDocument,
	filter: FilterQuery<ChartDocument>,
	getSongs: true,
): Promise<{ charts: Array<ChartDocument>; songs: Array<SongDocument> }>;
export async function GetFolderCharts(
	folder: FolderDocument,
	filter: FilterQuery<ChartDocument>,
	getSongs: false,
): Promise<{ charts: Array<ChartDocument> }>;
export async function GetFolderCharts(
	folder: FolderDocument,
	filter: FilterQuery<ChartDocument> = {},
	getSongs = false,
): Promise<{ charts: Array<ChartDocument>; songs?: Array<SongDocument> }> {
	const chartIDs = await GetFolderChartIDs(folder.folderID);

	const charts = await MONGODB_KILL.anyCharts[folder.game].find(
		deepmerge.all([{ playtype: folder.playtype }, { chartID: { $in: chartIDs } }, filter]),
	);

	if (getSongs) {
		const songs = await MONGODB_KILL.anySongs[folder.game].find({
			id: { $in: charts.map((e) => e.songID) },
		});

		return { songs, charts };
	}

	return { charts };
}

export async function GetFolderChartIDs(folderID: string) {
	const chartIDs = await MONGODB_KILL["folder-chart-lookup"].find(
		{
			folderID,
		},
		{
			projection: {
				chartID: 1,
			},
		},
	);

	return chartIDs.map((e) => e.chartID);
}

export async function CreateFolderChartLookup(folder: FolderDocument, flush = false) {
	try {
		const { charts } = await ResolveFolderToCharts(folder, {}, false);

		if (flush) {
			await MONGODB_KILL["folder-chart-lookup"].remove({
				folderID: folder.folderID,
			});
		}

		const ops: Array<BulkWriteOperation<FolderChartLookup>> = charts.map((c) => ({
			updateOne: {
				filter: {
					chartID: c.chartID,
					folderID: folder.folderID,
				},

				// amusing no-op
				update: {
					$set: {
						chartID: c.chartID,
						folderID: folder.folderID,
					},
				},
				upsert: true,
			},
		}));

		if (ops.length === 0) {
			return;
		}

		// we do a bulk-upsert here to avoid race conditions if multiple things try to
		// create a folder-chart-lookup at the same time.
		await MONGODB_KILL["folder-chart-lookup"].bulkWrite(ops);
	} catch (err) {
		log.error({ folder, err }, `Failed to create folder chart lookup for ${folder.title}.`);
		throw err;
	}
}

/**
 * Creates the "folder-chart-lookup" cache. This is used to optimise
 * common use cases, such as retrieving chartIDs from a folder.
 */
export async function InitaliseFolderChartLookup() {
	log.info(`Started InitialiseFolderChartLookup`);
	await MONGODB_KILL["folder-chart-lookup"].remove({});
	log.info(`Flushed Cache.`);

	// temporary hack -- this will still break if we introduce a new
	// playtype on staging or something.
	// We need to have separate seeds for staging and prod! todo #609.
	const folders = await MONGODB_KILL.folders.find({
		game: { $in: TachiConfig.GAMES },
	});

	log.info(`Reloading ${folders.length} folders.`);

	await Promise.all(folders.map((folder) => CreateFolderChartLookup(folder)));

	log.info(`Completed InitialiseFolderChartLookup.`);
}

export async function GetFoldersFromTable(table: TableDocument) {
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
export async function GetFolderNamesInOrder(table: TableDocument): Promise<Array<string>> {
	const folders = await GetFoldersFromTable(table);

	// we have to iterate over these folders in the order the table document says
	// to
	// as bms tables are somewhat sensitive to being placed in the correct order.
	const folderMap = new Map<string, FolderDocument>();

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

export async function GetPBsOnFolder(userID: integer, folder: FolderDocument) {
	const { charts, songs } = await GetFolderCharts(folder, {}, true);

	const pbs = await MONGODB_KILL["personal-bests"].find({
		userID,
		chartID: { $in: charts.map((e) => e.chartID) },
	});

	return { pbs, charts, songs };
}

/**
 * Get the distribution for this all gpt enums for this user on this folder.
 */
export async function GetEnumDistForFolder(userID: integer, folder: FolderDocument) {
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
export async function GetEnumDistForFolders(userID: integer, folders: Array<FolderDocument>) {
	return Promise.all(folders.map((folder) => GetEnumDistForFolder(userID, folder)));
}

function GetEnumDist(pbs: Array<PBScoreDocument>, enumMetric: string) {
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

export async function GetTableForIDGuaranteed(tableID: string): Promise<TableDocument> {
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
