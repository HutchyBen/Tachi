import type { KtLogger } from "#lib/log/log.js";
import type { FilterQuery } from "mongodb";

import db from "#services/mongo/db";
import { GetBlacklist } from "#utils/queries/blacklist";
import { GetUserWithID } from "#utils/user";
import fjsh from "fast-json-stable-hash";

import type { GameGroup, ImportTypes, integer } from "tachi-common";
import type {
	ConverterFnReturnOrFailure,
	ConverterFunction,
	ImportTypeContextMap,
	ImportTypeDataMap,
	OrphanScoreDocument,
} from "../../import-types/common/types";

import { Converters } from "../../import-types/converters";
import { type ConverterFailure, IsConverterFailure } from "../common/converter-failures";
import { HandlePostImportSteps } from "../score-importing/score-import-main";
import { ProcessSuccessfulConverterReturn } from "../score-importing/score-importing";

/**
 * Creates an OrphanedScore document from the data and context,
 * and inserts it into the DB if it is not already in there.
 *
 * @returns Returns { success: true | false, orphanID }
 */
export async function OrphanScore<T extends ImportTypes = ImportTypes>(
	importType: T,
	userID: integer,
	data: ImportTypeDataMap[T],
	context: ImportTypeContextMap[T],
	errMsg: string | null,
	game: GameGroup,
	log: KtLogger,
) {
	const orphan: Pick<OrphanScoreDocument, "context" | "data" | "importType" | "userID"> = {
		importType,
		data,
		context,
		userID,
	};

	log.debug(orphan, "Orphaning document");

	let orphanID;

	try {
		orphanID = `O${fjsh.hash(orphan, "sha256")}`;
	} catch (err) {
		log.error({ err, orphan }, `Failed to orphan score -- `);
		throw new Error(`Failed to orphan score. ${(err as Error).message}`);
	}

	const exists = await db["orphan-scores"].findOne({ orphanID });

	if (exists) {
		log.debug(`Skipped orphaning score ${orphanID} because it already exists.`);
		return { success: false, orphanID };
	}

	const orphanScoreDoc: OrphanScoreDocument = {
		...orphan,
		orphanID,
		game,
		errMsg,
		timeInserted: Date.now(),
	};

	log.debug(orphanScoreDoc, `Inserting orphanScoreDoc...`);

	await db["orphan-scores"].insert(orphanScoreDoc);

	return { success: true, orphanID };
}

/**
 * Takes an orphan document and re-runs the converter->scoreimport pipeline on its data.
 *
 * @returns False if no parent documents could be found for the score again,
 * Null if the orphan document was removed, but no score was inserted (i.e. score was orphaned AND invalid, so nothing
 * could be imported when parents were found).
 * ImportProcessingInfo on success.
 */
export async function ReprocessOrphan(
	orphan: OrphanScoreDocument,
	blacklist: Array<string>,
	log: KtLogger,
) {
	const ConverterFunction = Converters[orphan.importType] as ConverterFunction<
		ImportTypeDataMap[ImportTypes],
		ImportTypeContextMap[ImportTypes]
	>;

	let res: ConverterFnReturnOrFailure;

	try {
		res = await ConverterFunction(orphan.data, orphan.context, orphan.importType, log);
	} catch (e) {
		const err = e as ConverterFailure | Error;

		// this is impossible to test, so we're going to ignore it
		/* istanbul ignore next */
		if (!("failureType" in err)) {
			log.error(
				{
					err,
					orphan,
				},
				`Converter function ${orphan.importType} returned unexpected error. ID=${orphan.orphanID}`,
			);

			// throw this higher up, i guess.
			throw err;
		}

		res = err;
	}

	if ("failureType" in res) {
		// If the data still can't be found, we do nothing about it.
		if (res.failureType === "SongOrChartNotFound") {
			log.debug(`Unorphaning ${orphan.orphanID} failed. (${res.message})`);
			return false;
		} else if (res.failureType === "Internal") {
			log.error(`Orphan Internal Failure - ${res.message}, OrphanID ${orphan.orphanID}`);

			return false;
		}

		// otherwise, it's another converterfailure we don't need to specifically handle.
		log.warn(
			`received ConverterFailure ${res.message} on orphan ${orphan.orphanID}. Removing orphan.`,
		);

		// @danger - This could go terribly, if there's a mistake in the converterFN we might accidentally
		// remove a users score.
		await db["orphan-scores"].remove({ orphanID: orphan.orphanID });

		return null;
	}

	// else, import the orphan.

	let converterReturns;

	try {
		converterReturns = await ProcessSuccessfulConverterReturn(
			orphan.userID,
			res,
			blacklist,
			log,
			true,
		);
	} catch (err) {
		if (IsConverterFailure(err) && err.failureType === "InvalidScore") {
			await db["orphan-scores"].remove({ orphanID: orphan.orphanID });
			return null;
		}

		// Deliberately do not delete the orphan here, so the orphaned score
		// can be inspected for errors.
		throw err;
	}

	if (converterReturns === null || !converterReturns.success) {
		await db["orphan-scores"].remove({ orphanID: orphan.orphanID });
		return null;
	}

	const user = await GetUserWithID(orphan.userID);

	if (!user) {
		log.error(
			`Orphan ${orphan.orphanID} belongs to ${orphan.userID}, but that user no longer exists in the database. Going to skip this and remove the orphan.`,
		);
		await db["orphan-scores"].remove({ orphanID: orphan.orphanID });
		return null;
	}

	await HandlePostImportSteps(
		[converterReturns],
		user,
		orphan.importType,
		orphan.game,
		null,
		log,
		undefined,
	);

	await db["orphan-scores"].remove({ orphanID: orphan.orphanID });
	return converterReturns;
}

export async function DeorphanScores(query: FilterQuery<OrphanScoreDocument>, log: KtLogger) {
	const orphans = await db["orphan-scores"].find(query);

	// ScoreIDs are essentially userID dependent, so this is fine.
	const blacklist = await GetBlacklist();

	log.info({ query }, `Found ${orphans.length} orphans.`);

	let failed = 0;
	let success = 0;
	let removed = 0;
	let processed = 0;

	for (const or of orphans) {
		// We have to await like this to avoid mid-air race conditions,
		// where two orphans attempt to deorphan to the same scoreID
		// at the same time.
		// See #511.

		processed++;

		try {
			// eslint-disable-next-line no-await-in-loop
			const r = await ReprocessOrphan(or, blacklist, log);

			if (r === null) {
				removed++;
			} else if (r === false) {
				failed++;
			} else {
				success++;
			}
		} catch (err) {
			log.error({ orphanID: or.orphanID, err }, `Failed to reprocess orphan.`);
			failed++;
		}
	}

	return { processed, removed, failed, success };
}
