import type { KtLogger } from "#lib/log/log.js";
import type { integer } from "tachi-common";

import { GetKaiAuthGuaranteed } from "#utils/queries/auth";

import { ParseKaiIIDX } from "../../common/api-kai/iidx/parser";

export async function ParseFloIIDX(userID: integer, log: KtLogger) {
	const authDoc = await GetKaiAuthGuaranteed(userID, "FLO", log);

	return ParseKaiIIDX("FLO", authDoc, log);
}
