import type { KtLogger } from "#lib/log/log";
import type { integer } from "tachi-common";

import { ParseKaiSDVX } from "#lib/score-import/import-types/common/api-kai/sdvx/parser";
import { GetKaiAuthGuaranteed } from "#utils/queries/auth";

export async function ParseMinSDVX(userID: integer, log: KtLogger) {
	const authDoc = await GetKaiAuthGuaranteed(userID, "MIN", log);

	return ParseKaiSDVX("MIN", authDoc, log);
}
