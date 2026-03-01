import type { KtLogger } from "#lib/logger/logger";
import type { integer } from "../../../../../../../common/src";

import { GetKaiAuthGuaranteed } from "#utils/queries/auth";

import { ParseKaiIIDX } from "../../common/api-kai/iidx/parser";

export async function ParseEagIIDX(userID: integer, logger: KtLogger) {
	const authDoc = await GetKaiAuthGuaranteed(userID, "EAG", logger);

	return ParseKaiIIDX("EAG", authDoc, logger);
}
