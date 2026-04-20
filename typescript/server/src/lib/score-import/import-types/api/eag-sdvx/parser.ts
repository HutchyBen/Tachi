import type { KtLogger } from "#lib/log/log";
import type { integer } from "tachi-common";

import { ParseKaiSDVX } from "#lib/score-import/import-types/common/api-kai/sdvx/parser";
import { GetKaiAuthGuaranteed } from "#utils/queries/auth";

export async function ParseEagSDVX(userID: integer, log: KtLogger) {
	const authDoc = await GetKaiAuthGuaranteed(userID, "EAG", log);

	return ParseKaiSDVX("EAG", authDoc, log);
}
