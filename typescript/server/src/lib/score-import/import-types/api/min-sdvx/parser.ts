import type { KtLogger } from "#lib/logger/log.js";

import { GetKaiAuthGuaranteed } from "#utils/queries/auth";

import type { integer } from "../../../../../../../common/src";

import { ParseKaiSDVX } from "../../common/api-kai/sdvx/parser";

export async function ParseMinSDVX(userID: integer, log: KtLogger) {
	const authDoc = await GetKaiAuthGuaranteed(userID, "MIN", logger);

	return ParseKaiSDVX("MIN", authDoc, logger);
}
