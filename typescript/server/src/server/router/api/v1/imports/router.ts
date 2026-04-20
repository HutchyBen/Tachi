import type { ScoreImportWorkerReturns } from "#lib/score-import/worker/types";

import { ACTION_DeleteImport } from "#actions/delete-import";
import { JOB_RETRY_COUNT, SYMBOL_TACHI_API_AUTH } from "#lib/constants/tachi";
import {
	GetImportTrackerByImportId,
	ListFailedImportTrackers,
	ListRecentImportDocuments,
	LoadImportDocumentById,
} from "#lib/db-formats/import-document";
import { LoadSessionDocumentById } from "#lib/db-formats/session";
import { GetImportScores } from "#lib/imports/imports";
import { log } from "#lib/log/log";
import { withImport } from "#lib/router/middleware";
import { success } from "#lib/router/typed-router";
import ScoreImportQueue, { ScoreImportQueueEvents } from "#lib/score-import/worker/queue";
import { ServerConfig, TachiConfig } from "#lib/setup/config";
import { GetRelevantSongsAndCharts } from "#utils/db";
import { GetUsersWithIDs, GetUserWithID } from "#utils/user";
import { ExpectedErr } from "bliss";

import { API_V1_ROUTER } from "../router";

// ─── Admin-facing import list ─────────────────────────────────────────────────

/**
 * Query imports. Returns the 500 most recently-finished imports.
 *
 * @param importType - Optionally, limit the returns to only this import type.
 * @param userIntent - Optionally, limit returns to only those with or without userIntent.
 *
 * @name GET /api/v1/imports
 */
API_V1_ROUTER.add("GET /imports", async ({ input }) => {
	const userIntent = input.userIntent === undefined ? undefined : input.userIntent === "true";

	const imports = await ListRecentImportDocuments({
		importType: input.importType as never,
		limit: 500,
		userIntent,
	});

	const users = await GetUsersWithIDs(imports.map((e) => e.userID));

	return success(`Found ${imports.length} imports.`, { imports, users });
});

/**
 * Query *failed* imports. Returns the 500 most recently-finished imports.
 *
 * This is done by checking import-trackers for imports that ended with a thrown
 * error. An import is considered 'failed' if ScoreImportFatalError is thrown at any
 * point during the process, or if any unknown error is thrown.
 *
 * @param importType - Optionally, limit the returns to only this import type.
 * @param userIntent - Optionally, limit returns to only those with or without userIntent.
 *
 * @name GET /api/v1/imports/failed
 */
API_V1_ROUTER.add("GET /imports/failed", async ({ input }) => {
	const userIntent = input.userIntent === undefined ? undefined : input.userIntent === "true";

	const trackers = await ListFailedImportTrackers({
		importType: input.importType as never,
		limit: 500,
		userIntent,
	});

	const users = await GetUsersWithIDs(trackers.map((e) => e.userID));

	return success(`Found ${trackers.length} failed imports.`, { failedImports: trackers, users });
});

/**
 * Retrieve an import with this ID.
 *
 * @name GET /api/v1/imports/:importID
 */
API_V1_ROUTER.add("GET /imports/:importID", withImport, async ({ ctx }) => {
	const { importDoc } = ctx;

	const scores = await GetImportScores(importDoc);
	const { songs, charts } = await GetRelevantSongsAndCharts(scores);

	const sessions = (
		await Promise.all(
			importDoc.createdSessions.map((e) => LoadSessionDocumentById(e.sessionID)),
		)
	).filter((s): s is NonNullable<typeof s> => s !== undefined);

	const user = await GetUserWithID(importDoc.userID);

	if (!user) {
		log.error(`User ${importDoc.userID} doesn't exist, yet has an import?`);
		throw new ExpectedErr(500, "An internal server error has occurred.");
	}

	return success("Returned info about this import.", {
		charts,
		import: importDoc,
		scores,
		sessions,
		songs,
		user,
	});
});

/**
 * Delete this import and revert it from having ever happened. This un-imports all
 * of the scores that were imported.
 *
 * Must be a request from the owner of this import.
 *
 * Counterintuitively, this endpoint requires the "delete_score" permission. This is
 * because reverting an import is actually just deleting all of its scores.
 *
 * @name POST /api/v1/imports/:importID/revert
 */
API_V1_ROUTER.add("POST /imports/:importID/revert", withImport, async ({ params, req }) => {
	const auth = req[SYMBOL_TACHI_API_AUTH];

	if (auth.userID === null) {
		throw new ExpectedErr(401, "Authentication is required.");
	}

	const user = await GetUserWithID(auth.userID);

	if (!user) {
		throw new ExpectedErr(401, "Authentication is required.");
	}

	await ACTION_DeleteImport(
		{ acct: { id: user.id, username: user.username }, ip: req.ip },
		{ id: params.importID },
	);

	return success("Reverted import.", {});
});

// ─── Import poll-status ───────────────────────────────────────────────────────

// Finding jobs is slightly harder than just doing a key lookup, because of retrying.
async function FindImportJob(importID: string) {
	const possibleImportIDs = [];

	for (let i = 1; i <= JOB_RETRY_COUNT; i++) {
		possibleImportIDs.push(`${importID}:TRY${i}`);
	}

	try {
		// Note that instead of the cleaner await-inside-for here, we parallelise this
		// for performance.
		const maybeJob = (
			await Promise.all(possibleImportIDs.map((i) => ScoreImportQueue.getJob(i)))
		).find((k) => k);

		return maybeJob;
	} catch (_err) {
		return undefined;
	}
}

/**
 * Retrieve the status of an ongoing import.
 * If the import has been finalised and was successful, return 200.
 *
 * If the import is ongoing, return its progress.
 *
 * If the import was never ongoing, return 404.
 *
 * If the import was finalised and was unsuccessful (i.e. threw a fatal error)
 * return its error information.
 *
 * @name GET /api/v1/imports/:importID/poll-status
 */
API_V1_ROUTER.add("GET /imports/:importID/poll-status", async ({ params }) => {
	if (!ServerConfig.USE_EXTERNAL_SCORE_IMPORT_WORKER) {
		throw new ExpectedErr(
			501,
			`${TachiConfig.NAME} does not use an external score import worker. Polling imports is not possible.`,
		);
	}

	const importDoc = await LoadImportDocumentById(params.importID);

	if (importDoc) {
		return success("Import was completed!", {
			import: importDoc,
			importStatus: "completed",
		});
	}

	const job = await FindImportJob(params.importID);

	if (!job) {
		const tracker = await GetImportTrackerByImportId(params.importID);

		if (!tracker) {
			throw new ExpectedErr(404, "There is no ongoing import here.");
		}

		// The user has requested the status of the import before the job has even
		// been sent to redis. This is rare, but prevents a race condition of saying
		// that an import is not ongoing when it is.
		switch (tracker.type) {
			case "ONGOING":
				return success("Import is ongoing.", { importStatus: "ongoing", progress: 0 });

			case "FAILED":
				return {
					$status: tracker.error.statusCode ?? 500,
					body: {},
					description: tracker.error.message,
					success: true as const,
				};

			default:
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				throw new Error(`Unknown tracker type ${(tracker as any).type}`);
		}
	}

	let isFailed: boolean;

	try {
		isFailed = await job.isFailed();
	} catch (err) {
		log.info(`Failed to read job: ${err}`);
		isFailed = true;
	}

	let isCompleted: boolean;

	try {
		isCompleted = await job.isCompleted();
	} catch (err) {
		log.info(`Failed to read job: ${err}`);
		isCompleted = false;
	}

	// job.isFailed() means a critical error has occurred — an unhandled exception was thrown.
	if (isFailed) {
		log.error({ job }, "Internal Server Error with job?");
		throw new ExpectedErr(500, "An internal service error has occurred with this import.");
	}

	if (isCompleted) {
		const content = (await job.waitUntilFinished(
			ScoreImportQueueEvents,
		)) as ScoreImportWorkerReturns;

		// content.success == true means the import finished cleanly.
		// Otherwise it was a ScoreImportFatalError (bad user input etc.).
		if (content.success) {
			return success("Import was completed!", {
				import: content.ImportDocument,
				importStatus: "completed",
			});
		}

		return {
			$status: content.statusCode,
			body: {},
			description: content.description,
			success: true,
		};
	}

	const progress = job.progress;

	return success("Import is ongoing.", {
		importStatus: "ongoing",
		progress: progress === 0 ? { description: "Starting up import." } : progress,
	});
});
