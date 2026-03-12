import type { KtLogger } from "#lib/logger/logger";

import { GetKaiAuthGuaranteed } from "#utils/queries/auth";

import type { integer } from "../../../../../../../common/src";

import { ParseKaiIIDX } from "../../common/api-kai/iidx/parser";

export async function ParseFloIIDX(userID: integer, logger: KtLogger) {
	const authDoc = await GetKaiAuthGuaranteed(userID, "FLO", logger);

	return ParseKaiIIDX("FLO", authDoc, logger);
}
