import type { KtLogger } from "#lib/log/log";
import type {
	ConverterFnReturnOrFailure,
	ConverterFunction,
	ImportTypeContextMap,
	ImportTypeDataMap,
	OrphanScoreDocument,
} from "#lib/score-import/import-types/common/types";
import type { GameGroup, ImportTypes, integer } from "tachi-common";
import type { OrphanScore as PgOrphanScoreRow } from "tachi-db";

import { SELECT_ORPHAN_SCORE } from "#lib/db-formats/orphan-score";
import { Converters } from "#lib/score-import/import-types/converters";
import DB from "#services/pg/db";
import { GetBlacklist } from "#utils/queries/blacklist";
import { GetUserWithID } from "#utils/user";
import fjsh from "fast-json-stable-hash";
import { sql } from "kysely";

import { type ConverterFailure, IsConverterFailure } from "../common/converter-failures";
import { HandlePostImportSteps } from "../score-importing/score-import-main";
import { ProcessSuccessfulConverterReturn } from "../score-importing/score-importing";

export type DeorphanScoresFilter = {
	/** Beatoraja: match `context.chart.sha256` (import_type forced to ir/beatoraja). */
	chartSha256?: string;
	pmsPlaytype?: "Controller" | "Keyboard";
	userID?: integer;
};

function pgOrphanRowToDocument(row: PgOrphanScoreRow): OrphanScoreDocument {
	return {
		orphanID: row.orphan_id,
		userID: row.user_id,
		importType: row.import_type as ImportTypes,
		game: row.game_group as GameGroup,
		data: row.data as OrphanScoreDocument["data"],
		context: row.context as OrphanScoreDocument["context"],
		errMsg: row.error_message.length > 0 ? row.error_message : null,
		timeInserted: new Date(row.time_inserted).getTime(),
	};
}

async function deleteOrphanByOrphanId(orphanID: string): Promise<void> {
	await DB.deleteFrom("orphan_score").where("orphan_id", "=", orphanID).execute();
}

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
	importId: string,
) {
	const orphan: Pick<OrphanScoreDocument, "context" | "data" | "importType" | "userID"> = {
		importType,
		data,
		context,
		userID,
	};

	log.debug(orphan, "Orphaning document");

	let orphanID: string;

	try {
		orphanID = `O${fjsh.hash(orphan, "sha256")}`;
	} catch (err) {
		log.error({ err, orphan }, `Failed to orphan score -- `);
		throw new Error(`Failed to orphan score. ${(err as Error).message}`);
	}

	const inserted = await DB.insertInto("orphan_score")
		.values({
			orphan_id: orphanID,
			user_id: userID,
			import_id: importId,
			import_type: importType,
			game_group: game,
			data,
			context,
			time_inserted: new Date().toISOString(),
			error_message: errMsg ?? "",
		})
		.onConflict((oc) => oc.column("orphan_id").doNothing())
		.returning("orphan_id")
		.executeTakeFirst();

	if (!inserted) {
		log.debug(`Skipped orphaning score ${orphanID} because it already exists.`);
		return { success: false, orphanID };
	}

	log.debug({ orphanID }, `Inserted orphan_score row.`);

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
		await deleteOrphanByOrphanId(orphan.orphanID);

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
			null,
			{ forceImmediateImport: true, directCommit: true },
		);
	} catch (err) {
		if (IsConverterFailure(err) && err.failureType === "InvalidScore") {
			await deleteOrphanByOrphanId(orphan.orphanID);
			return null;
		}

		// Deliberately do not delete the orphan here, so the orphaned score
		// can be inspected for errors.
		throw err;
	}

	if (converterReturns === null || !converterReturns.success) {
		await deleteOrphanByOrphanId(orphan.orphanID);
		return null;
	}

	const user = await GetUserWithID(orphan.userID);

	if (!user) {
		log.error(
			`Orphan ${orphan.orphanID} belongs to ${orphan.userID}, but that user no longer exists in the database. Going to skip this and remove the orphan.`,
		);
		await deleteOrphanByOrphanId(orphan.orphanID);
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
		"",
	);

	await deleteOrphanByOrphanId(orphan.orphanID);
	return converterReturns;
}

export async function DeorphanScores(filter: DeorphanScoresFilter, log: KtLogger) {
	let q = DB.selectFrom("orphan_score").select(SELECT_ORPHAN_SCORE);

	if (filter.userID !== undefined) {
		q = q.where("orphan_score.user_id", "=", filter.userID);
	}

	if (filter.chartSha256 !== undefined) {
		q = q
			.where("orphan_score.import_type", "=", "ir/beatoraja")
			.where(
				sql<boolean>`(orphan_score.context::jsonb->'chart'->>'sha256') = ${filter.chartSha256}`,
			);

		if (filter.pmsPlaytype !== undefined) {
			if (filter.pmsPlaytype === "Controller") {
				q = q.where(
					sql<boolean>`(orphan_score.data::jsonb->>'deviceType') = ${"BM_CONTROLLER"}`,
				);
			} else {
				q = q.where(
					sql<boolean>`(orphan_score.data::jsonb->>'deviceType') IS DISTINCT FROM ${"BM_CONTROLLER"}`,
				);
			}
		}
	}

	const rows = await q.execute();
	const orphans = rows.map(pgOrphanRowToDocument);

	// ScoreIDs are essentially userID dependent, so this is fine.
	// TODO(zk): Gooood the performance of this is shit, what the fuck man.
	const blacklist = await GetBlacklist();

	log.info({ filter }, `Found ${orphans.length} orphans.`);

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
