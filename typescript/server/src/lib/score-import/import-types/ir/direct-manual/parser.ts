import type { KtLogger } from "#lib/log/log.js";
import type { BatchManualScore } from "tachi-common";

import type { BatchManualContext } from "../../common/batch-manual/types";
import type { ParserFunctionReturns } from "../../common/types";

import { ParseBatchManualFromObject } from "../../common/batch-manual/parser";

/**
 * Parses an object of BATCH-MANUAL data.
 * @param fileData - The buffer to parse.
 * @param body - The request body that made this file import request.
 */
function ParseDirectManual(
	body: Record<string, unknown>,
	inferTimestamp: boolean,
	log: KtLogger,
): ParserFunctionReturns<BatchManualScore, BatchManualContext> {
	return ParseBatchManualFromObject(body, "ir/direct-manual", inferTimestamp, log);
}

export default ParseDirectManual;
