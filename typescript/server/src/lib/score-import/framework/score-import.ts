import type { ImportDocument, ImportTypes } from "tachi-common";

import { ACTION_ScoreImport } from "#actions/score-import";
import { LoadImportDocumentById } from "#lib/db-formats/import-document";
import { ServerConfig } from "#lib/setup/config";
import { GetUserWithIDGuaranteed } from "#utils/user";

import type { ScoreImportJobData } from "../worker/types";

import ScoreImportFatalError from "./score-importing/score-import-error";

/**
 * Makes a score import given ScoreImportJobData (same process as the API).
 *
 * When `USE_EXTERNAL_SCORE_IMPORT_WORKER` is true, HTTP routes call
 * {@link EnqueueScoreImportJob} instead — this function is only used for the
 * inline (non-queued) path.
 */
export async function MakeScoreImport<I extends ImportTypes>(
	jobData: ScoreImportJobData<I>,
): Promise<ImportDocument> {
	if (ServerConfig.USE_EXTERNAL_SCORE_IMPORT_WORKER) {
		throw new ScoreImportFatalError(
			500,
			"MakeScoreImport may not be used when an external score-import worker is enabled; use EnqueueScoreImportJob instead.",
		);
	}

	const user = await GetUserWithIDGuaranteed(jobData.userID);
	await ACTION_ScoreImport(
		{ ip: null, acct: { id: user.id, username: user.username } },
		{
			importID: jobData.importID,
			importType: jobData.importType,
			userIntent: jobData.userIntent,
			"!parserArguments": jobData.parserArguments as Array<unknown>,
		},
	);
	const importDocument = await LoadImportDocumentById(jobData.importID);
	if (!importDocument) {
		throw new ScoreImportFatalError(
			500,
			"Import completed but the import document could not be loaded.",
		);
	}
	return importDocument;
}
