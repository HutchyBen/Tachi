import type { KtLogger } from "#lib/log/log";
import type { integer } from "tachi-common";

import { GetKaiAuthGuaranteed } from "#utils/queries/auth";

import { ParseKaiSDVX } from "../../common/api-kai/sdvx/parser";

export async function ParseMinSDVX(userID: integer, log: KtLogger) {
	const authDoc = await GetKaiAuthGuaranteed(userID, "MIN", log);

	return ParseKaiSDVX("MIN", authDoc, log);
}
