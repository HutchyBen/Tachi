import { DeleteUndefinedProps } from "#utils/misc.js";
import {
	GetGPTConfig,
	type GPTString,
	type GPTStringToV3Game,
	type integer,
	type MongoDerivedMetrics,
	type MongoOptionalMetrics,
	type MongoProvidedMetrics,
	type MongoScoreData,
	type PgScoreData,
	type V3Game,
	type V3GameToGPTString,
	V3GetGameConfig,
} from "tachi-common";

interface RetVal<GPT extends GPTString> {
	derived: MongoDerivedMetrics[GPT];
	data: MongoOptionalMetrics[GPT] & MongoProvidedMetrics[GPT];
}

/**
 * For every key in `obj` whose corresponding metric definition is an ENUM,
 * replace the string value with its integer ordinal (index in `values`).
 * Non-enum fields and non-string values pass through unchanged.
 */
function applyOrdinals(
	obj: Record<string, unknown>,
	metricDefs: Record<string, { type: string; values?: Array<string> }>,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(obj)) {
		const def = metricDefs[key];

		if (def?.type === "ENUM" && typeof value === "string") {
			result[key] = def.values!.indexOf(value);
		} else {
			result[key] = value;
		}
	}

	return result;
}

function splitScoreData<GPT extends GPTString = GPTString>(
	gpt: GPT,
	sd: MongoScoreData<GPT>,
): RetVal<GPT> {
	const config = GetGPTConfig(gpt);

	const scoreData = sd as any;

	const eventualOut: any = {
		data: {},
		derived: {},
		judgements: scoreData.judgements,
	};

	for (const [key, value] of Object.entries(config.providedMetrics)) {
		if (value.type === "ENUM") {
			eventualOut.data[key] = value.values.indexOf(scoreData[key]);
		} else {
			eventualOut.data[key] = scoreData[key];
		}
	}

	for (const [key, value] of Object.entries(config.derivedMetrics)) {
		if (value.type === "ENUM") {
			eventualOut.derived[key] = value.values.indexOf(scoreData[key]);
		} else {
			eventualOut.derived[key] = scoreData[key];
		}
	}

	for (const [key, value] of Object.entries(config.optionalMetrics)) {
		if (value.type === "ENUM") {
			eventualOut.data[key] = value.values.indexOf(scoreData.optional[key]);
		} else {
			eventualOut.data[key] = scoreData.optional[key];
		}
	}

	return eventualOut;
}

export function mongoScoreDataToPg<GPT extends GPTString = GPTString>(
	gpt: GPT,
	scoreData: MongoScoreData,
): PgScoreData<GPTStringToV3Game[GPT]> {
	const { data, derived } = splitScoreData(gpt, scoreData);

	const config = GetGPTConfig(gpt);

	return {
		data: applyOrdinals(data, config.providedMetrics as any) as any,
		derived: applyOrdinals(derived, config.derivedMetrics as any) as any,
		judgements: scoreData.judgements,
	};
}

/**
 * Reconstruct API {@link MongoScoreData} from Postgres `data` / `derived_data` JSON blobs
 * and the `judgements` column (the inverse of {@link mongoScoreDataToPg}).
 */
export function pgScoreDataToMongo<G extends V3Game = V3Game>(
	game: G,
	scoreData: PgScoreData<G>,
): MongoScoreData<V3GameToGPTString[G]> {
	const data = scoreData.data as any;
	const derived = scoreData.derived as any;

	const config = V3GetGameConfig(game);

	const eventualOut: any = {
		enumIndexes: {},
		optional: {
			enumIndexes: {},
		},
		judgements: scoreData.judgements,
	};

	for (const [key, value] of Object.entries(config.providedMetrics)) {
		if (value.type === "ENUM") {
			const index: integer = data[key];
			eventualOut[key] = value.values[index];
			eventualOut.enumIndexes[key] = index;
		} else {
			eventualOut[key] = data[key];
		}
	}

	for (const [key, value] of Object.entries(config.derivedMetrics)) {
		if (value.type === "ENUM") {
			const index: integer = derived[key];
			eventualOut[key] = value.values[index];
			eventualOut.enumIndexes[key] = index;
		} else {
			eventualOut[key] = derived[key];
		}
	}

	for (const [key, value] of Object.entries(config.optionalMetrics)) {
		if (value.type === "ENUM") {
			const index: integer = data[key];
			eventualOut.optional[key] = value.values[index];
			eventualOut.optional.enumIndexes[key] = index;
		} else {
			eventualOut.optional[key] = data[key];
		}
	}

	DeleteUndefinedProps(eventualOut.optional);
	DeleteUndefinedProps(eventualOut);

	return eventualOut as any;
}
