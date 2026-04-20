import type { KtLogger } from "#lib/log/log";
import type { integer } from "tachi-common";

import { ParseKaiIIDX } from "#lib/score-import/import-types/common/api-kai/iidx/parser";
import { GetKaiAuthGuaranteed } from "#utils/queries/auth";

export async function ParseFloIIDX(userID: integer, log: KtLogger) {
	const authDoc = await GetKaiAuthGuaranteed(userID, "FLO", log);

	return ParseKaiIIDX("FLO", authDoc, log);
}
