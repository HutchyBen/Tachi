import type { ParserArguments } from "#lib/score-import/worker/types";
import type {
	ImportDocument,
	ImportTypes,
	integer,
	SuccessfulAPIResponse,
	UnsuccessfulAPIResponse,
} from "tachi-common";

import { log } from "#lib/log/log";
import { AwaitScoreImportWorkerResult } from "#lib/score-import/worker/await-worker-result";
import { EnqueueScoreImportJob } from "#lib/score-import/worker/enqueue-pg";
import { ServerConfig } from "#lib/setup/config";
import { Random20Hex } from "#utils/misc";
import { ExpectedErr } from "bliss";

import { MakeScoreImport } from "./score-import";
import ScoreImportFatalError from "./score-importing/score-import-error";

export interface WrappedAPIResponse {
	statusCode: number;
	body: SuccessfulAPIResponse<ImportDocument> | UnsuccessfulAPIResponse;
}

/**
 * A thin(ish) wrapper for ScoreImportMain which converts thrown
 * errors and import documents into a WrappedAPIResponse, which can
 * be immediately sent with res.json().
 */
export async function ExpressWrappedScoreImportMain<I extends ImportTypes>(
	userID: integer,
	userIntent: boolean,
	importType: I,
	parserArguments: ParserArguments<I>,
): Promise<WrappedAPIResponse> {
	const importID = Random20Hex();

	log.debug("Received import request.");

	try {
		const jobData = {
			importID,
			importType,
			userIntent,
			userID,
			parserArguments,
		};

		let res: ImportDocument;
		if (ServerConfig.USE_EXTERNAL_SCORE_IMPORT_WORKER) {
			await EnqueueScoreImportJob(jobData);
			res = await AwaitScoreImportWorkerResult(importID);
		} else {
			res = await MakeScoreImport(jobData);
		}

		return {
			statusCode: 200,
			body: {
				success: true,
				description: "Import successful.",
				body: res,
			},
		};
	} catch (err) {
		// `ACTION_ScoreImport` throws `ExpectedErr` (mapped from `ScoreImportFatalError`); the
		// await helper throws `ScoreImportFatalError` when the worker records a failed import.
		if (ExpectedErr.is(err) || err instanceof ScoreImportFatalError) {
			const description = ExpectedErr.is(err) ? err.reason : err.message;
			const statusCode = ExpectedErr.is(err) ? err.code : err.statusCode;
			log.info(description);
			return {
				statusCode,
				body: {
					success: false,
					description,
				},
			};
		}

		log.error(err);
		return {
			statusCode: 500,
			body: {
				success: false,
				description: "An internal service error has occured. This has been reported!",
			},
		};
	}
}
