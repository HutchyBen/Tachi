import type { KtLogger } from "#lib/logger/log.js";

import { GetKaiAuthGuaranteed } from "#utils/queries/auth";

import type { integer } from "../../../../../../../common/src";

import { ParseKaiSDVX } from "../../common/api-kai/sdvx/parser";

export async function ParseFloSDVX(userID: integer, log: KtLogger) {
	const authDoc = await GetKaiAuthGuaranteed(userID, "FLO", logger);

	return ParseKaiSDVX("FLO", authDoc, logger);
}
