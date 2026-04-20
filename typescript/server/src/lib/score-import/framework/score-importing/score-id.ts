import type { KtLogger } from "#lib/log/log";

import fjsh from "fast-json-stable-hash";
import {
	GetGameConfig,
	type integer,
	type MongoOptionalMetrics,
	type MongoProvidedMetrics,
	type V3Game,
} from "tachi-common";

import type { DryScore } from "../common/types";

/**
 * Creates an identifier for this score.
 * This is used to deduplicate repeated scores.
 */
export function CreateScoreID(
	game: V3Game,
	userID: integer,
	dryScore: DryScore,
	chartID: string,
	logger?: KtLogger,
) {
	const elements: Record<string, number | string> = { userID, chartID };

	const gameConfig = GetGameConfig(game);

	for (const m of Object.keys(gameConfig.providedMetrics)) {
		const metric = m as keyof MongoProvidedMetrics[V3Game];

		elements[metric] = dryScore.scoreData[metric];
	}

	// Also include optional metrics in the checksum if they should be
	// part of the scoreID.
	for (const [m, conf] of Object.entries(gameConfig.optionalMetrics)) {
		const metric = m as keyof MongoOptionalMetrics[V3Game];

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
