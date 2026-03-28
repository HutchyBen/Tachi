import type { KtLogger } from "#lib/log/log";
import type { MONGO_KaiAuthDocument } from "tachi-common";

import nodeFetch from "#utils/fetch";

import type { ParserFunctionReturns } from "../../types";
import type { KaiContext } from "../types";

import { CreateKaiReauthFunction } from "../reauth";
import { type KaiAPIReauthFunction, TraverseKaiAPI } from "../traverse-api";
import { KaiTypeToBaseURL } from "../utils";
import { CreateKaiSDVXClassProvider } from "./class-handler";

export async function ParseKaiSDVX(
	service: "EAG" | "FLO" | "MIN",
	authDoc: MONGO_KaiAuthDocument,
	log: KtLogger,
	fetch = nodeFetch,
	reauthFn: KaiAPIReauthFunction | null = null,
): Promise<ParserFunctionReturns<unknown, KaiContext>> {
	const baseUrl = KaiTypeToBaseURL(service);

	const resolvedReauthFn = reauthFn ?? CreateKaiReauthFunction(service, authDoc, log, fetch);

	// auth *before* starting import to avoid a partial-import
	authDoc.token = await resolvedReauthFn();

	return {
		iterable: TraverseKaiAPI(
			baseUrl,
			"/api/sdvx/v1/play_history",
			authDoc.token,
			log,
			resolvedReauthFn,
			fetch,
		),
		context: {
			service,
		},
		classProvider: await CreateKaiSDVXClassProvider(
			service,
			authDoc.token,
			resolvedReauthFn,
			fetch,
		),
		game: "sdvx",
	};
}
