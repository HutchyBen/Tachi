import type { KtLogger } from "#lib/log/log.js";
import type { EmptyObject } from "#utils/types";

import ScoreImportFatalError from "#lib/score-import/framework/score-importing/score-import-error";
import { MaimaiUserClient } from "#proto/generated/maimai/user_grpc_pb";
import { GetPlaylogRequest, type GetPlaylogStreamItem } from "#proto/generated/maimai/user_pb";
import { credentials } from "@grpc/grpc-js";

import type { integer } from "tachi-common";
import type { ParserFunctionReturns } from "../../common/types";
import type { MytMaimaiDxScore } from "./types";

import {
	FetchMytTitleAPIID,
	GetMytHostname,
	StreamRPCAsAsync,
} from "../../common/api-myt/traverse-api";

async function* getObjectsFromGrpcIterable(
	iterable: AsyncIterable<GetPlaylogStreamItem>,
): AsyncIterable<MytMaimaiDxScore> {
	for await (const item of iterable) {
		yield item.toObject();
	}
}

export default async function ParseMytMaimaiDx(
	userID: integer,
	log: KtLogger,
): Promise<ParserFunctionReturns<MytMaimaiDxScore, EmptyObject>> {
	const profileApiId = await FetchMytTitleAPIID(userID, "maimaidx", log);
	const endpoint = GetMytHostname();
	const client = new MaimaiUserClient(endpoint, credentials.createSsl());
	const request = new GetPlaylogRequest();

	request.setProfileApiId(profileApiId);

	let iterable;

	try {
		const stream = StreamRPCAsAsync(client.getPlaylog.bind(client), request, log);

		iterable = getObjectsFromGrpcIterable(stream);
	} catch (err) {
		log.error(
			`Unexpected MYT error while streaming maimai DX playlog items for userID ${userID}: ${err}`,
		);

		throw new ScoreImportFatalError(500, `Failed to get scores from MYT.`);
	}

	return {
		iterable,
		context: {},
		classProvider: null,
		game: "maimaidx",
	};
}
