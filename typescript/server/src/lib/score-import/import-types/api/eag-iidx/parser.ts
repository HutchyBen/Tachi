import type { KtLogger } from "#lib/log/log";
import type { integer } from "tachi-common";

import { GetKaiAuthGuaranteed } from "#utils/queries/auth";

import { ParseKaiIIDX } from "../../common/api-kai/iidx/parser";

export async function ParseEagIIDX(userID: integer, log: KtLogger) {
	const authDoc = await GetKaiAuthGuaranteed(userID, "EAG", log);

	return ParseKaiIIDX("EAG", authDoc, log);
}
