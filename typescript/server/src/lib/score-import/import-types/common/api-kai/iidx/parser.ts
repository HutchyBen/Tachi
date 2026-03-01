import type { KtLogger } from "#lib/logger/logger";

import nodeFetch from "#utils/fetch";

import type { KaiAuthDocument } from "../../../../../../../../common/src";
import type { ParserFunctionReturns } from "../../types";
import type { KaiContext } from "../types";

import { CreateKaiReauthFunction } from "../reauth";
import { TraverseKaiAPI } from "../traverse-api";
import { KaiTypeToBaseURL } from "../utils";
import { CreateKaiIIDXClassProvider } from "./class-handler";

export async function ParseKaiIIDX(
	service: "EAG" | "FLO",
	authDoc: KaiAuthDocument,
	logger: KtLogger,
	fetch = nodeFetch,
	reauthFn: (() => Promise<string>) | null = null,
): Promise<ParserFunctionReturns<unknown, KaiContext>> {
	const baseUrl = KaiTypeToBaseURL(service);

	const resolvedReauthFn = reauthFn ?? CreateKaiReauthFunction(service, authDoc, logger, fetch);

	// auth *before* starting import to avoid a partial-import
	authDoc.token = await resolvedReauthFn();

	return {
		iterable: TraverseKaiAPI(
			baseUrl,
			"/api/iidx/v2/play_history",
			authDoc.token,
			logger,
			resolvedReauthFn,
			fetch,
		),
		context: {
			service,
		},
		classProvider: await CreateKaiIIDXClassProvider(
			service,
			authDoc.token,
			resolvedReauthFn,
			fetch,
		),
		game: "iidx",
	};
}
