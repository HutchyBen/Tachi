import type { KtLogger } from "#lib/log/log.js";
import type { KaiAuthDocument } from "tachi-common";

import ScoreImportFatalError from "#lib/score-import/framework/score-importing/score-import-error";
import { ServerConfig } from "#lib/setup/config";
import MONGODB_KILL from "#services/mongo/db";
import nodeFetch from "#utils/fetch";
import { p } from "prudence";

import { GetKaiTypeClientCredentials, KaiTypeToBaseURL } from "./utils";

const REAUTH_SCHEMA = {
	access_token: "string",
	refresh_token: "string",
};

export function CreateKaiReauthFunction(
	kaiType: "EAG" | "FLO" | "MIN",
	authDoc: KaiAuthDocument,
	log: KtLogger,
	fetch = nodeFetch,
) {
	const maybeCredentials = GetKaiTypeClientCredentials(kaiType);

	/* istanbul ignore next */
	if (!maybeCredentials) {
		log.error(
			`No CLIENT_ID or CLIENT_SECRET was configured for ${kaiType}. Cannot create reauth function.`,
		);
		throw new ScoreImportFatalError(
			500,
			`Fatal error in performing authentication. This has been reported.`,
		);
	}

	const { CLIENT_ID, CLIENT_SECRET } = maybeCredentials;

	return async () => {
		let res;

		try {
			const url = `${KaiTypeToBaseURL(kaiType)}/oauth/token`;

			res = await fetch(url, {
				body: new URLSearchParams({
					refresh_token: authDoc.refreshToken,
					grant_type: "refresh_token",
					client_secret: CLIENT_SECRET,
					client_id: CLIENT_ID,
				}).toString(),
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
			});
		} catch (err) {
			log.error({ res, err }, `Unexpected error while fetching reauth?`);
			throw new ScoreImportFatalError(
				500,
				"An error has occured while attempting reauthentication.",
			);
		}

		/* istanbul ignore next */
		if (res.status !== 200) {
			const text = await res.text();

			if (res.status === 400) {
				// we now entirely expect this and have no way to fix it.
				throw new ScoreImportFatalError(
					400,
					`Your authentication with this service has expired, and a bug on their end prevents us from automatically renewing it.
					
					Please go to ${ServerConfig.OUR_URL}/u/me/integrations/services to un-link and re-link.`,
				);
			}

			log.error({ res, text }, `Unexpected ${res.status} error while fetching reauth?`);
			throw new ScoreImportFatalError(
				500,
				"An error has occured while attempting reauthentication.",
			);
		}

		let json;
		/* istanbul ignore next */

		try {
			json = (await res.json()) as unknown;
		} catch (err) {
			log.error({ res, err }, `Invalid JSON body in successful reauth response.`);
			throw new ScoreImportFatalError(
				500,
				"An error has occured while attempting reauthentication.",
			);
		}

		const err = p(json, REAUTH_SCHEMA, {}, { allowExcessKeys: true, throwOnNonObject: false });

		if (err) {
			log.error({ err, json }, `Invalid JSON body in successful reauth response.`);
			throw new ScoreImportFatalError(
				500,
				"An error has occured while attempting reauthentication.",
			);
		}

		// asserted by prudence
		const validatedContent = json as {
			access_token: string;
			refresh_token: string;
		};

		await MONGODB_KILL["kai-auth-tokens"].update(
			{
				userID: authDoc.userID,
				service: authDoc.service,
			},
			{
				$set: {
					token: validatedContent.access_token,
					refreshToken: validatedContent.refresh_token,
				},
			},
		);

		return validatedContent.access_token;
	};
}
