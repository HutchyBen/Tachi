import type { KtLogger } from "#lib/log/log";
import type { integer } from "tachi-common";

import { ParseKaiSDVX } from "#lib/score-import/import-types/common/api-kai/sdvx/parser";
import { GetKaiAuthGuaranteed } from "#utils/queries/auth";

export async function ParseFloSDVX(userID: integer, log: KtLogger) {
	const authDoc = await GetKaiAuthGuaranteed(userID, "FLO", log);

	return ParseKaiSDVX("FLO", authDoc, log);
}
