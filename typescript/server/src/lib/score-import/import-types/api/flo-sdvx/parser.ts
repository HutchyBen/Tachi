import type { KtLogger } from "#lib/log/log.js";
import type { integer } from "tachi-common";

import { GetKaiAuthGuaranteed } from "#utils/queries/auth";

import { ParseKaiSDVX } from "../../common/api-kai/sdvx/parser";

export async function ParseFloSDVX(userID: integer, log: KtLogger) {
	const authDoc = await GetKaiAuthGuaranteed(userID, "FLO", log);

	return ParseKaiSDVX("FLO", authDoc, log);
}
