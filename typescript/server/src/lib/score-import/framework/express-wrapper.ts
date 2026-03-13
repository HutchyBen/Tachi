import { log } from "#lib/logger/log.js";
import { Random20Hex } from "#utils/misc";

import type {
	ImportDocument,
	ImportTypes,
	integer,
	SuccessfulAPIResponse,
	UnsuccessfulAPIResponse,
} from "../../../../../common/src";
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
		// this is definitely fine, as the errors are emitted from the same place.
		if (err instanceof ScoreImportFatalError) {
			log.info(err.message);
			return {
				statusCode: err.statusCode,
				body: {
					success: false,
					description: err.message,
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
