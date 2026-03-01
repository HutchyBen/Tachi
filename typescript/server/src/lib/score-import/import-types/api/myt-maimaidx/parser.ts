import type { KtLogger } from "#lib/logger/logger";
import type { EmptyObject } from "#utils/types";
import type { integer } from "../../../../../../../common/src";

import ScoreImportFatalError from "#lib/score-import/framework/score-importing/score-import-error";
import { credentials } from "@grpc/grpc-js";
import { MaimaiUserClient } from "#proto/generated/maimai/user_grpc_pb";
import { GetPlaylogRequest, type GetPlaylogStreamItem } from "#proto/generated/maimai/user_pb";

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
	logger: KtLogger,
): Promise<ParserFunctionReturns<MytMaimaiDxScore, EmptyObject>> {
	const profileApiId = await FetchMytTitleAPIID(userID, "maimaidx", logger);
	const endpoint = GetMytHostname();
	const client = new MaimaiUserClient(endpoint, credentials.createSsl());
	const request = new GetPlaylogRequest();

	request.setProfileApiId(profileApiId);

	let iterable;

	try {
		const stream = StreamRPCAsAsync(client.getPlaylog.bind(client), request, logger);

		iterable = getObjectsFromGrpcIterable(stream);
	} catch (err) {
		logger.error(
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
