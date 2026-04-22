import type {
	ImportDocument,
	ImportTypes,
	integer,
	SuccessfulAPIResponse,
	UnsuccessfulAPIResponse,
} from "tachi-common";

import { log } from "#lib/log/log";
import { Random20Hex } from "#utils/misc";
import { ExpectedErr } from "bliss";

import type { ParserArguments } from "../worker/types";

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
		const res = await MakeScoreImport({
			importID,
			importType,
			userIntent,
			userID,
			parserArguments,
		});

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
		// external-worker guard in `MakeScoreImport` still throws `ScoreImportFatalError`.
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
