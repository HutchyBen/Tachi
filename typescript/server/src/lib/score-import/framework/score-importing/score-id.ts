import type { KtLogger } from "#lib/log/log";

import MONGODB_KILL from "#services/mongo/db";
import fjsh from "fast-json-stable-hash";
import {
	GetGPTConfig,
	type GPTString,
	type integer,
	type OptionalMetrics,
	type ProvidedMetrics,
} from "tachi-common";

import type { DryScore } from "../common/types";

/**
 * Creates an identifier for this score.
 * This is used to deduplicate repeated scores.
 */
export function CreateScoreID(
	gptString: GPTString,
	userID: integer,
	dryScore: DryScore,
	chartID: string,
	logger?: KtLogger,
) {
	const elements: Record<string, number | string> = { userID, chartID };

	const gptConfig = GetGPTConfig(gptString);

	for (const m of Object.keys(gptConfig.providedMetrics)) {
		const metric = m as keyof ProvidedMetrics[GPTString];

		elements[metric] = dryScore.scoreData[metric];
	}

	// Also include optional metrics in the checksum if they should be
	// part of the scoreID.
	for (const [m, conf] of Object.entries(gptConfig.optionalMetrics)) {
		const metric = m as keyof OptionalMetrics[GPTString];

		if (conf.partOfScoreID) {
			elements[`optional.${metric}`] = dryScore.scoreData.optional[metric] ?? null;
		}
	}

	// use a stable object hashing method instead of string joining
	// as it's immune to key order or anything screwy like that.
	let hash;

	try {
		hash = fjsh.hash(elements, "sha256");
	} catch (err) {
		logger?.error({ err, elements, dryScore }, `Failed to checksum score`);
		throw err;
	}

	return `T${hash}`;
}

export function GetWithScoreID(scoreID: string) {
	return MONGODB_KILL.scores.findOne({
		scoreID,
	});
}
