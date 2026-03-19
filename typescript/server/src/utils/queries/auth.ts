import type { KtLogger } from "#lib/log/log.js";
import type { integer } from "tachi-common";

import ScoreImportFatalError from "#lib/score-import/framework/score-importing/score-import-error";
import MONGODB_KILL from "#services/mongo/db";

export function GetKaiAuth(userID: integer, service: "EAG" | "FLO" | "MIN") {
	return MONGODB_KILL["kai-auth-tokens"].findOne({
		userID,
		service,
	});
}

export function RevokeKaiAuth(userID: integer, service: "EAG" | "FLO" | "MIN") {
	return MONGODB_KILL["kai-auth-tokens"].remove({
		userID,
		service,
	});
}

export async function GetKaiAuthGuaranteed(
	userID: integer,
	service: "EAG" | "FLO" | "MIN",
	log: KtLogger,
) {
	const authDoc = await GetKaiAuth(userID, service);

	if (!authDoc) {
		log.error(`No authentication was stored for ${service}.`);
		throw new ScoreImportFatalError(401, `No authentication was stored for ${service}.`);
	}

	return authDoc;
}
