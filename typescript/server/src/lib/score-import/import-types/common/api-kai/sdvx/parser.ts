import type { KtLogger } from "#lib/logger/logger";

import nodeFetch from "#utils/fetch";

import type { KaiAuthDocument } from "../../../../../../../../common/src";
import type { ParserFunctionReturns } from "../../types";
import type { KaiContext } from "../types";

import { CreateKaiReauthFunction } from "../reauth";
import { type KaiAPIReauthFunction, TraverseKaiAPI } from "../traverse-api";
import { KaiTypeToBaseURL } from "../utils";
import { CreateKaiSDVXClassProvider } from "./class-handler";

export async function ParseKaiSDVX(
	service: "EAG" | "FLO" | "MIN",
	authDoc: KaiAuthDocument,
	logger: KtLogger,
	fetch = nodeFetch,
	reauthFn: KaiAPIReauthFunction | null = null,
): Promise<ParserFunctionReturns<unknown, KaiContext>> {
	const baseUrl = KaiTypeToBaseURL(service);

	const resolvedReauthFn = reauthFn ?? CreateKaiReauthFunction(service, authDoc, logger, fetch);

	// auth *before* starting import to avoid a partial-import
	authDoc.token = await resolvedReauthFn();

	return {
		iterable: TraverseKaiAPI(
			baseUrl,
			"/api/sdvx/v1/play_history",
			authDoc.token,
			logger,
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
