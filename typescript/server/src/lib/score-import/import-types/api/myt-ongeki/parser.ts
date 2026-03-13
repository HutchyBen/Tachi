import type { KtLogger } from "#lib/logger/log.js";
import type { EmptyObject } from "#utils/types";

import ScoreImportFatalError from "#lib/score-import/framework/score-importing/score-import-error";
import { OngekiUserClient } from "#proto/generated/ongeki/user_grpc_pb";
import { GetPlaylogRequest, type GetPlaylogStreamItem } from "#proto/generated/ongeki/user_pb";
import { credentials } from "@grpc/grpc-js";

import type { integer } from "../../../../../../../common/src";
import type { ParserFunctionReturns } from "../../common/types";
import type { MytOngekiScore } from "./types";

import {
	FetchMytTitleAPIID,
	GetMytHostname,
	StreamRPCAsAsync,
} from "../../common/api-myt/traverse-api";

async function* getObjectsFromGrpcIterable(
	iterable: AsyncIterable<GetPlaylogStreamItem>,
): AsyncIterable<MytOngekiScore> {
	for await (const item of iterable) {
		yield item.toObject();
	}
}

export default async function ParseMytOngeki(
	userID: integer,
	log: KtLogger,
): Promise<ParserFunctionReturns<MytOngekiScore, EmptyObject>> {
	const profileApiId = await FetchMytTitleAPIID(userID, "ongeki", logger);
	const endpoint = GetMytHostname();
	const client = new OngekiUserClient(endpoint, credentials.createSsl());
	const request = new GetPlaylogRequest();

	request.setProfileApiId(profileApiId);

	let iterable;

	try {
		const stream = StreamRPCAsAsync(client.getPlaylog.bind(client), request, logger);

		iterable = getObjectsFromGrpcIterable(stream);
	} catch (err) {
		log.error(
			`Unexpected MYT error while streaming Ongeki playlog items for userID ${userID}: ${err}`,
		);

		throw new ScoreImportFatalError(500, `Failed to get scores from MYT.`);
	}

	return {
		iterable,
		context: {},
		classProvider: null,
		game: "ongeki",
	};
}
