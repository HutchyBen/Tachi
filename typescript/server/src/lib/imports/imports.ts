import { log } from "#lib/logger/log.js";
import {
	CheckAndSetOngoingImportLock,
	UnsetOngoingImportLock,
} from "#lib/score-import/framework/import-locks/lock";
import { DeleteMultipleScores } from "#lib/score-mutation/delete-scores";
import db from "#services/mongo/db";

import type { ImportDocument } from "../../../../common/src";

interface OngoingImportError {
	tag: "ONGOING_IMPORT";
}

/**
 * Given an importDocument, undo it. This will remove all of the scores inside the import.
 *
 * It will *not* undo things like classes that were set, but it will invoke a profile recalculation.
 *
 * If this results in sessions being deleted, it will delete them.
 */
export async function RevertImport(importDoc: ImportDocument): Promise<OngoingImportError | null> {
	log.info(`Received revert-import request for import '${importDoc.importID}'`, { importDoc });

	const scores = await GetImportScores(importDoc);

	const hasNoOngoingImport = await CheckAndSetOngoingImportLock(importDoc.userID);

	if (hasNoOngoingImport) {
		log.info(`User ${importDoc.userID} tried to revert an import while they had one ongoing.`);

		return {
			tag: "ONGOING_IMPORT",
		};
	}

	try {
		await DeleteMultipleScores(scores);

		log.info(
			`Deleted ${scores.length} scores as part of reverting import '${importDoc.importID}'.`,
			{ importDoc },
		);

		try {
			await db.imports.remove({ importID: importDoc.importID });

			log.info(`Reverted and deleted import '${importDoc.importID}'.`);
		} catch (err) {
			log.error(
				`Deleted scores that were part of import, but failed to remove the actual import? There is a stale import with ID '${importDoc.importID}', which must be removed manually.`,
				{ importDoc, err },
			);
		}
	} finally {
		await UnsetOngoingImportLock(importDoc.userID);
	}

	return null;
}

/**
 * Retrieve the scores inside this import.
 */
export function GetImportScores(importDoc: ImportDocument) {
	return db.scores.find({ scoreID: { $in: importDoc.scoreIDs } });
}
