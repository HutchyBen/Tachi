import type { KtLogger } from "#lib/log/log";
import type { EmptyObject } from "#utils/types";
import type { integer } from "tachi-common";

import ScoreImportFatalError from "#lib/score-import/framework/score-importing/score-import-error";
import { GetPlaylogRequestSchema, OngekiUser } from "#proto/generated/ongeki/user_pb";
import { create } from "@bufbuild/protobuf";
import { ConnectError, createClient } from "@connectrpc/connect";

import type { ParserFunctionReturns } from "../../common/types";
import type { MytOngekiScore } from "./types";

import { CreateMytTransport, FetchMytTitleAPIID } from "../../common/api-myt/traverse-api";

async function* streamPlaylog(userID: integer, log: KtLogger): AsyncIterable<MytOngekiScore> {
	const profileApiId = await FetchMytTitleAPIID(userID, "ongeki", log);
	const client = createClient(OngekiUser, CreateMytTransport());
	const request = create(GetPlaylogRequestSchema, { profileApiId });

	try {
		for await (const item of client.getPlaylog(request)) {
			yield item;
		}
	} catch (err) {
		if (err instanceof ConnectError) {
			log.error(
				{ err, code: err.code },
				`MYT gRPC error streaming Ongeki playlog for userID ${userID}`,
			);
		} else {
			log.error(
				{ err },
				`Unexpected MYT error streaming Ongeki playlog for userID ${userID}`,
			);
		}

		throw new ScoreImportFatalError(500, `Failed to get scores from MYT.`);
	}
}

export default async function ParseMytOngeki(
	userID: integer,
	log: KtLogger,
): Promise<ParserFunctionReturns<MytOngekiScore, EmptyObject>> {
	return {
		iterable: streamPlaylog(userID, log),
		context: {},
		classProvider: null,
		game: "ongeki",
	};
}
