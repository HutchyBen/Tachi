import type { BulkWriteOperation, DeleteWriteOpResultObject } from "mongodb";
import type { ICollection } from "monk";
import type {
	BMSCourseDocument,
	ChartDocument,
	FolderDocument,
	GameGroup,
	GoalDocument,
	QuestDocument,
	QuestlineDocument,
	SongDocument,
	TableDocument,
} from "tachi-common";

import { type KtLogger, log } from "#lib/log/log";
import { UpdateGoalsInFolder } from "#lib/score-import/framework/goals/goals";
import UpdateIsPrimaryStatus from "#lib/score-mutation/update-isprimary";
import { PullDatabaseSeeds } from "#lib/seeds/repo";
import { TachiConfig } from "#lib/setup/config";
import { RemoveStaleFolderShowcaseStats } from "#lib/showcase/showcase";
import { UpdateQuestSubscriptions } from "#lib/targets/quests";
/* eslint-disable no-await-in-loop */
import MONGODB_KILL, { monkDB } from "#services/mongo/db";
import { RecalcAllScores } from "#utils/calculations/recalc-scores";
import { UpdateGameSongIDCounter } from "#utils/db";
import { ArrayDiff, IsSupported, WrapScriptPromise } from "#utils/misc";
import fjsh from "fast-json-stable-hash";

interface SyncInstructions {
	pattern: RegExp;
	handler: (
		c: Array<any>,
		collection: ICollection,
		log: KtLogger,
		collectionName: string,
	) => Promise<unknown>;
}

async function RemoveNotPresent<T extends Record<string, any>>(
	documents: Array<T>,
	collection: ICollection<T>,
	field: keyof T,
	log: KtLogger,
) {
	log.debug(`Removing all documents that are no longer present.`);

	// Remove anything no longer present.
	// Note that $nin is incredibly slow.
	// @ts-expect-error generic system failing
	const r = (await collection.remove({
		[field]: { $nin: documents.map((e) => e[field] as unknown) },
	})) as DeleteWriteOpResultObject;

	if (r.deletedCount !== undefined && r.deletedCount > 0) {
		log.info(`Removed ${r.deletedCount} documents.`);
	}
}

async function GenericUpsert<T extends Record<string, any>>(
	documents: Array<T>,
	collection: ICollection<T>,
	field: keyof T,
	log: KtLogger,
	remove = false,
	update = true,
) {
	if (remove) {
		await RemoveNotPresent(documents, collection, field, log);
	}

	log.debug(`Running bulkwrite.`);

	const updateOps: Array<BulkWriteOperation<T>> = [];
	const insertOps: Array<BulkWriteOperation<T>> = [];

	const allExistingDocs = await collection.find({});

	const map = new Map<unknown, T>();

	for (const doc of allExistingDocs) {
		map.set(doc[field], doc);
	}

	const changedFields = [];

	let i = 0;

	for (const document of documents) {
		i++;
		if (i % 10_000 === 0) {
			log.debug(`On document ${i}/${documents.length}.`);
		}

		const exists = map.get(document[field]);

		if (exists === undefined) {
			insertOps.push({
				// @ts-expect-error Actually, T is assignable to OptionalId<T>.
				insertOne: { document },
			});
		} else if (update) {
			const changed = fjsh.hash(document, "sha256") !== fjsh.hash(exists, "sha256");

			if (!changed) {
				continue;
			}

			log.debug(`Updating ${document[field]}`);

			updateOps.push({
				replaceOne: {
					// @ts-expect-error Known X->Y generic issue.
					filter: {
						[field]: document[field],
					},
					replacement: document,
				},
			});

			// Update all changed documents, but only record a subset of it as "actually changed"
			// to lighten the load of recalcs.
			let shouldMarkAsChanged: boolean = changed;

			if (collection.name.startsWith("charts-")) {
				// Do not count charts that only have their `versions` array updated as changed.
				// This is for the benefit of games with regular new versions (e.g. maimai DX/CHUNITHM
				// has a new version every 6 months) and need new versions added to the array for tables
				// and folders, but doesn't need a recalc because the `levelNum` (a.k.a. internal level)
				// has not changed.
				//
				// Currently, there should be no games depending on the versions array for metric calculation
				// (DDR uses song.data.flareCategory instead).
				shouldMarkAsChanged =
					fjsh.hash({ ...document, versions: [] }, "sha256") !==
					fjsh.hash({ ...exists, versions: [] }, "sha256");
			}

			if (shouldMarkAsChanged) {
				changedFields.push(document[field]);
			}
		}
	}

	const thingsChanged = updateOps.length + insertOps.length;

	if (thingsChanged === 0) {
		log.debug(`No differences. Not performing any update.`);
	} else {
		// update first, then insert new docs
		let up;

		if (updateOps.length > 0) {
			up = await collection.bulkWrite(updateOps);
		}

		let ins;

		if (insertOps.length > 0) {
			ins = await collection.bulkWrite(insertOps);
		}

		log.info(
			{
				up,
				ins,
			},
			`Performed bulkWrite.`,
		);
	}

	return {
		thingsChanged,
		changedFields,
	};
}

const syncInstructions: Array<SyncInstructions> = [
	{
		pattern: /^charts-(b|p)ms/u,
		handler: async (
			charts: Array<ChartDocument>,
			collection: ICollection<ChartDocument>,
			log,
			collectionName,
		) => {
			const r = await GenericUpsert(charts, collection, "chartID", log, false);

			if (r.thingsChanged) {
				// await InitaliseFolderChartLookup();
				await UpdateIsPrimaryStatus();

				await UpdateGameSongIDCounter(collectionName.includes("bms") ? "bms" : "pms");

				await RecalcAllScores({
					game: collectionName.split("-")[1],
					chartID: { $in: r.changedFields },
				});
			}
		},
	},
	{
		pattern: /^charts-/u,
		handler: async (
			charts: Array<ChartDocument>,
			collection: ICollection<ChartDocument>,
			log,
			collName,
		) => {
			const r = await GenericUpsert(charts, collection, "chartID", log, true);

			if (r.thingsChanged) {
				// await InitaliseFolderChartLookup();
				await UpdateIsPrimaryStatus();

				await RecalcAllScores({
					game: collName.split("-")[1],
					chartID: { $in: r.changedFields },
				});
			}
		},
	},
	{
		pattern: /^songs-(b|p)ms/u,
		handler: async (
			songs: Array<SongDocument>,
			collection: ICollection<SongDocument>,
			log,
			collName,
		) => {
			const r = await GenericUpsert(songs, collection, "id", log, false);

			if (r.thingsChanged) {
				await RecalcAllScores({
					game: collName.split("-")[1],
					songID: { $in: r.changedFields },
				});
			}
		},
	},
	{
		pattern: /^songs-/u,
		handler: async (
			songs: Array<SongDocument>,
			collection: ICollection<SongDocument>,
			log,
			collName,
		) => {
			const r = await GenericUpsert(songs, collection, "id", log, true);

			if (r.thingsChanged) {
				await RecalcAllScores({
					game: collName.split("-")[1],
					songID: { $in: r.changedFields },
				});
			}
		},
	},
	{
		pattern: /^folders/u,
		handler: async (
			folders: Array<FolderDocument>,
			collection: ICollection<FolderDocument>,
			log,
		) => {
			const r = await GenericUpsert(
				folders.filter((e) => TachiConfig.GAMES.includes(e.game)),
				collection,
				"folderID",
				log,
				true,
			);

			if (r.thingsChanged) {
				// await InitaliseFolderChartLookup();

				const allModifiedFolderIDs = r.changedFields as Array<string>;

				const keptFolderIDs = await MONGODB_KILL.folders.find(
					{
						folderID: { $in: allModifiedFolderIDs },
					},
					{ projection: { folderID: 1 } },
				);

				// Find out what folders have been removed by diffing the set of all
				// modified folders against all that are still present.
				const removedFolderIDs = ArrayDiff(
					allModifiedFolderIDs,
					keptFolderIDs.map((e) => e.folderID),
				);

				await RemoveStaleFolderShowcaseStats(removedFolderIDs);

				// update goals for everyone that was affected

				await Promise.all(keptFolderIDs.map((f) => UpdateGoalsInFolder(f.folderID, log)));
			}
		},
	},
	{
		pattern: /^tables/u,
		handler: (tables: Array<TableDocument>, collection: ICollection<TableDocument>, log) =>
			GenericUpsert(
				tables.filter((e) => TachiConfig.GAMES.includes(e.game)),
				collection,
				"tableID",
				log,
				true,
			),
	},
	{
		pattern: /^bms-course-lookup/u,
		handler: async (
			bmsCourseDocuments: Array<BMSCourseDocument>,
			collection: ICollection<BMSCourseDocument>,
			log,
		) => {
			if (TachiConfig.TYPE === "kamai") {
				return;
			}

			await GenericUpsert(bmsCourseDocuments, collection, "md5sums", log);
		},
	},
	{
		pattern: /^goals/u,
		handler: async (goals: Array<GoalDocument>, collection: ICollection<GoalDocument>, log) => {
			// never remove goals. Never update goals either. Only insert new ones as
			// they come in.
			await GenericUpsert(
				goals.filter((e) => IsSupported(e.game)),
				collection,
				"goalID",
				log,
				false,
				false,
			);
		},
	},
	{
		pattern: /^questlines/u,
		handler: async (
			questlines: Array<QuestlineDocument>,
			collection: ICollection<QuestlineDocument>,
			log,
		) => {
			// removing and updating these is fine. Users cannot subscibe to sets.
			await GenericUpsert(
				questlines.filter((e) => IsSupported(e.game)),
				collection,
				"questlineID",
				log,
			);
		},
	},
	{
		pattern: /^quests/u,
		handler: async (
			quests: Array<QuestDocument>,
			collection: ICollection<QuestDocument>,
			log,
		) => {
			const r = await GenericUpsert(
				quests.filter((e) => IsSupported(e.game)),
				collection,
				"questID",
				log,
				true,
			);

			if (r.thingsChanged) {
				const affectedQuestIDs = r.changedFields as Array<string>;

				await Promise.all(affectedQuestIDs.map((e) => UpdateQuestSubscriptions(e)));
			}
		},
	},
];

async function SynchroniseDBWithSeeds() {
	// Wait for mongo to connect first.
	await monkDB.then(() => void 0);

	const databaseSeedsRepo = await PullDatabaseSeeds();

	for await (const { collectionName, data } of databaseSeedsRepo.IterateCollections()) {
		if (collectionName.startsWith("songs-") || collectionName.startsWith("charts-")) {
			const game = collectionName.split("-")[1];

			if (!TachiConfig.GAMES.includes(game as GameGroup)) {
				log.debug(
					`Skipping ${collectionName} (${game}) as it isn't for ${TachiConfig.NAME}.`,
				);
				continue;
			}
		}

		log.debug(`Found ${data.length} documents.`);

		let matchedSomething = false;

		for (const syncInst of syncInstructions) {
			if (syncInst.pattern.exec(collectionName)) {
				log.info(`Starting handler...`);
				await syncInst.handler(data, monkDB.get(collectionName), log, collectionName);
				matchedSomething = true;
				break;
			}
		}

		if (!matchedSomething) {
			log.warn(`Collection ${collectionName} didn't match any sync instructions. Skipping.`);
		}
	}

	log.info(`Done.`);

	await databaseSeedsRepo.Destroy();
}

if (require.main === module) {
	WrapScriptPromise(SynchroniseDBWithSeeds(), log);
}
