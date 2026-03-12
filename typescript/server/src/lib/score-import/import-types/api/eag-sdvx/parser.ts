import type { KtLogger } from "#lib/logger/logger";

import { GetKaiAuthGuaranteed } from "#utils/queries/auth";

import type { integer } from "../../../../../../../common/src";

import { ParseKaiSDVX } from "../../common/api-kai/sdvx/parser";

export async function ParseEagSDVX(userID: integer, logger: KtLogger) {
	const authDoc = await GetKaiAuthGuaranteed(userID, "EAG", logger);

	return ParseKaiSDVX("EAG", authDoc, logger);
}
