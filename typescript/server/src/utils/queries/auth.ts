import type { KtLogger } from "#lib/logger/log.js";

import ScoreImportFatalError from "#lib/score-import/framework/score-importing/score-import-error";
import db from "#services/mongo/db";

import type { integer } from "../../../../common/src";

export function GetKaiAuth(userID: integer, service: "EAG" | "FLO" | "MIN") {
	return db["kai-auth-tokens"].findOne({
		userID,
		service,
	});
}

export function RevokeKaiAuth(userID: integer, service: "EAG" | "FLO" | "MIN") {
	return db["kai-auth-tokens"].remove({
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
