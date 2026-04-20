import type { KtLogger } from "#lib/log/log";
import type { ParserFunctionReturns } from "#lib/score-import/import-types/common/types";
import type { EmptyObject } from "#utils/types";
import type { GamesForGroup, integer } from "tachi-common";

import ScoreImportFatalError from "#lib/score-import/framework/score-importing/score-import-error";
import {
	CreateMytTransport,
	FetchMytTitleAPIID,
} from "#lib/score-import/import-types/common/api-myt/traverse-api";
import { PlaylogRequestSchema, WaccaUser } from "#proto/generated/wacca/user_pb";
import { create } from "@bufbuild/protobuf";
import { ConnectError, createClient } from "@connectrpc/connect";

import type { MytWaccaScore } from "./types";

import CreateMytWACCAClassHandler from "./class-handler";

async function* streamPlaylog(apiId: string, log: KtLogger): AsyncIterable<MytWaccaScore> {
	const client = createClient(WaccaUser, CreateMytTransport());
	const request = create(PlaylogRequestSchema, { apiId });

	try {
		for await (const item of client.getPlaylog(request)) {
			if (!item.info) {
				log.warn(`Received WACCA playlog stream item with no info — skipping.`);
				continue;
			}

			yield item.info;
		}
	} catch (err) {
		if (err instanceof ConnectError) {
			log.error({ err, code: err.code }, `MYT gRPC error streaming WACCA playlog`);
		} else {
			log.error({ err }, `Unexpected MYT error streaming WACCA playlog`);
		}

		throw new ScoreImportFatalError(500, `Failed to get scores from MYT.`);
	}
}

export default async function ParseMytWACCA(
	userID: integer,
	log: KtLogger,
): Promise<ParserFunctionReturns<MytWaccaScore, EmptyObject, GamesForGroup["wacca"]>> {
	const titleApiId = await FetchMytTitleAPIID(userID, "wacca", log);

	let classProvider;

	try {
		classProvider = await CreateMytWACCAClassHandler(titleApiId, CreateMytTransport());
	} catch (err) {
		log.error(`Unexpected MYT error while fetching player data for userID ${userID}: ${err}`);
		throw new ScoreImportFatalError(500, `Failed to fetch player data from MYT.`);
	}

	return {
		iterable: streamPlaylog(titleApiId, log),
		context: {},
		classProvider,
		gameGroup: "wacca",
	};
}
