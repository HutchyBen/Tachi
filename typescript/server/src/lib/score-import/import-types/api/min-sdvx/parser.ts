import type { KtLogger } from "#lib/log/log.js";

import { GetKaiAuthGuaranteed } from "#utils/queries/auth";

import type { integer } from "tachi-common";

import { ParseKaiSDVX } from "../../common/api-kai/sdvx/parser";

export async function ParseMinSDVX(userID: integer, log: KtLogger) {
	const authDoc = await GetKaiAuthGuaranteed(userID, "MIN", log);

	return ParseKaiSDVX("MIN", authDoc, log);
}
