import type { KtLogger } from "#lib/log/log.js";

import { GetKaiAuthGuaranteed } from "#utils/queries/auth";

import type { integer } from "tachi-common";

import { ParseKaiSDVX } from "../../common/api-kai/sdvx/parser";

export async function ParseEagSDVX(userID: integer, log: KtLogger) {
	const authDoc = await GetKaiAuthGuaranteed(userID, "EAG", log);

	return ParseKaiSDVX("EAG", authDoc, log);
}
