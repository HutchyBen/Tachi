import type { KtLogger } from "#lib/logger/logger";
import type { integer } from "../../../../../../../common/src";

import { GetKaiAuthGuaranteed } from "#utils/queries/auth";

import { ParseKaiIIDX } from "../../common/api-kai/iidx/parser";

export async function ParseFloIIDX(userID: integer, logger: KtLogger) {
	const authDoc = await GetKaiAuthGuaranteed(userID, "FLO", logger);

	return ParseKaiIIDX("FLO", authDoc, logger);
}
