import { DeleteUndefinedProps, staticAssertUnreachable } from "#utils/misc.js";
import { Mongos } from "mongodb";
import {
	type DerivedMetrics,
	GetGPTConfig,
	type GPTString,
	type OptionalMetrics,
	type ProvidedMetrics,
	type MongoScoreData,
	PgScoreData,
	GPTStringToV3Game,
	integer,
} from "tachi-common";

interface RetVal<GPT extends GPTString> {
	derived: DerivedMetrics[GPT];
	data: OptionalMetrics[GPT] & ProvidedMetrics[GPT];
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

function splitScoreData(gpt: GPTString, scoreData: MongoScoreData): RetVal<GPTString> {
	switch (gpt) {
		case "iidx:SP": {
			const { grade, lamp, percent, score, optional } =
				scoreData as unknown as MongoScoreData<"iidx:SP">;

			const ret: RetVal<"iidx:SP"> = {
				data: {
					lamp,
					score,
					...optional,
				},
				derived: {
					grade,
					percent,
				},
			};

			return ret;
		}

		case "iidx:DP": {
			const { grade, lamp, percent, score, optional } =
				scoreData as unknown as MongoScoreData<"iidx:DP">;

			const ret: RetVal<"iidx:DP"> = {
				data: {
					lamp,
					score,
					...optional,
				},
				derived: { grade, percent },
			};

			return ret;
		}

		case "museca:Single": {
			const { grade, lamp, score, optional } =
				scoreData as unknown as MongoScoreData<"museca:Single">;

			const ret: RetVal<"museca:Single"> = {
				data: {
					lamp,
					score,
					...optional,
				},
				derived: { grade },
			};

			return ret;
		}

		case "chunithm:Single": {
			const { grade, score, noteLamp, clearLamp, optional } =
				scoreData as unknown as MongoScoreData<"chunithm:Single">;

			const ret: RetVal<"chunithm:Single"> = {
				data: {
					score,
					noteLamp,
					clearLamp,
					...optional,
				},
				derived: { grade },
			};

			return ret;
		}

		case "bms:7K": {
			const { grade, lamp, percent, score, optional } =
				scoreData as unknown as MongoScoreData<"bms:7K">;

			const ret: RetVal<"bms:7K"> = {
				data: {
					lamp,
					score,
					...optional,
				},
				derived: { grade, percent },
			};

			return ret;
		}

		case "bms:14K": {
			const { grade, lamp, percent, score, optional } =
				scoreData as unknown as MongoScoreData<"bms:14K">;

			const ret: RetVal<"bms:14K"> = {
				data: {
					lamp,
					score,
					...optional,
				},
				derived: { grade, percent },
			};

			return ret;
		}

		case "gitadora:Gita": {
			const { grade, lamp, percent, optional } =
				scoreData as unknown as MongoScoreData<"gitadora:Gita">;

			const ret: RetVal<"gitadora:Gita"> = {
				data: {
					lamp,
					percent,
					...optional,
				},
				derived: { grade },
			};

			return ret;
		}

		case "gitadora:Dora": {
			const { grade, lamp, percent, optional } =
				scoreData as unknown as MongoScoreData<"gitadora:Dora">;

			const ret: RetVal<"gitadora:Dora"> = {
				data: {
					lamp,
					percent,
					...optional,
				},
				derived: { grade },
			};

			return ret;
		}

		case "jubeat:Single": {
			const { grade, score, musicRate, lamp, optional } =
				scoreData as unknown as MongoScoreData<"jubeat:Single">;

			const ret: RetVal<"jubeat:Single"> = {
				data: {
					score,
					musicRate,
					lamp,
					...optional,
				},
				derived: { grade },
			};

			return ret;
		}

		case "maimai:Single": {
			const { grade, lamp, percent, optional } =
				scoreData as unknown as MongoScoreData<"maimai:Single">;

			const ret: RetVal<"maimai:Single"> = {
				data: {
					lamp,
					percent,
					...optional,
				},
				derived: { grade },
			};

			return ret;
		}

		case "maimaidx:Single": {
			const { grade, lamp, percent, optional } =
				scoreData as unknown as MongoScoreData<"maimaidx:Single">;

			const ret: RetVal<"maimaidx:Single"> = {
				data: {
					lamp,
					percent,
					...optional,
				},
				derived: { grade },
			};

			return ret;
		}

		case "popn:9B": {
			const { grade, lamp, score, clearMedal, optional } =
				scoreData as unknown as MongoScoreData<"popn:9B">;

			const ret: RetVal<"popn:9B"> = {
				data: {
					score,
					clearMedal,
					...optional,
				},
				derived: { grade, lamp },
			};

			return ret;
		}

		case "sdvx:Single": {
			const { grade, lamp, score, optional } =
				scoreData as unknown as MongoScoreData<"sdvx:Single">;

			const ret: RetVal<"sdvx:Single"> = {
				data: {
					lamp,
					score,
					...optional,
				},
				derived: { grade },
			};

			return ret;
		}

		case "usc:Controller": {
			const { grade, lamp, score, optional } =
				scoreData as unknown as MongoScoreData<"usc:Controller">;

			const ret: RetVal<"usc:Controller"> = {
				data: {
					lamp,
					score,
					...optional,
				},
				derived: { grade },
			};

			return ret;
		}

		case "usc:Keyboard": {
			const { grade, lamp, score, optional } =
				scoreData as unknown as MongoScoreData<"usc:Keyboard">;

			const ret: RetVal<"usc:Keyboard"> = {
				data: {
					lamp,
					score,
					...optional,
				},
				derived: { grade },
			};

			return ret;
		}

		case "wacca:Single": {
			const { grade, lamp, score, optional } =
				scoreData as unknown as MongoScoreData<"wacca:Single">;

			const ret: RetVal<"wacca:Single"> = {
				data: {
					lamp,
					score,
					...optional,
				},
				derived: { grade },
			};

			return ret;
		}

		case "pms:Controller": {
			const { grade, lamp, percent, score, optional } =
				scoreData as unknown as MongoScoreData<"pms:Controller">;

			const ret: RetVal<"pms:Controller"> = {
				data: {
					lamp,
					score,
					...optional,
				},
				derived: { grade, percent },
			};

			return ret;
		}

		case "pms:Keyboard": {
			const { grade, lamp, percent, score, optional } =
				scoreData as unknown as MongoScoreData<"pms:Keyboard">;

			const ret: RetVal<"pms:Keyboard"> = {
				data: {
					lamp,
					score,
					...optional,
				},
				derived: { grade, percent },
			};

			return ret;
		}

		case "itg:Stamina": {
			const { grade, lamp, scorePercent, survivedPercent, finalPercent, optional } =
				scoreData as unknown as MongoScoreData<"itg:Stamina">;

			const ret: RetVal<"itg:Stamina"> = {
				data: {
					lamp,
					scorePercent,
					survivedPercent,
					...optional,
				},
				derived: { grade, finalPercent },
			};

			return ret;
		}

		case "arcaea:Touch": {
			const { grade, lamp, score, optional } =
				scoreData as unknown as MongoScoreData<"arcaea:Touch">;

			const ret: RetVal<"arcaea:Touch"> = {
				data: {
					lamp,
					score,
					...optional,
				},
				derived: { grade },
			};

			return ret;
		}

		case "ongeki:Single": {
			const { grade, score, noteLamp, bellLamp, platinumScore, platinumStars, optional } =
				scoreData as unknown as MongoScoreData<"ongeki:Single">;

			const ret: RetVal<"ongeki:Single"> = {
				data: {
					score,
					noteLamp,
					bellLamp,
					platinumScore,
					...optional,
				},
				derived: { grade, platinumStars },
			};

			return ret;
		}

		case "ddr:SP": {
			const { grade, lamp, score, optional } =
				scoreData as unknown as MongoScoreData<"ddr:SP">;

			const ret: RetVal<"ddr:SP"> = {
				data: {
					lamp,
					score,
					...optional,
				},
				derived: { grade },
			};

			return ret;
		}

		case "ddr:DP": {
			const { grade, lamp, score, optional } =
				scoreData as unknown as MongoScoreData<"ddr:DP">;

			const ret: RetVal<"ddr:DP"> = {
				data: {
					lamp,
					score,
					...optional,
				},
				derived: { grade },
			};

			return ret;
		}
	}
}

export function mongoScoreDataToPg(
	gpt: GPTString,
	scoreData: MongoScoreData,
): { data: unknown; derived: unknown } {
	const { data, derived } = splitScoreData(gpt, scoreData);

	const config = GetGPTConfig(gpt);

	return {
		data: applyOrdinals(data, config.providedMetrics as any),
		derived: applyOrdinals(derived, config.derivedMetrics as any),
	};
}

/**
 * Reconstruct API {@link MongoScoreData} from Postgres `data` / `derived_data` JSON blobs
 * (the inverse of {@link mongoScoreDataToPg}).
 */
export function mergeScoreDataFromPg<G extends GPTString = GPTString>(
	gpt: G,
	dataRaw: any,
	derivedRaw: any,
): MongoScoreData<G> {
	const config = GetGPTConfig(gpt);

	const eventualOut: any = {
		enumIndexes: {},
		optional: {
			enumIndexes: {},
		},
	};

	for (const [key, value] of Object.entries(config.providedMetrics)) {
		if (value.type === "ENUM") {
			const index: integer = dataRaw[key];
			eventualOut[key] = value.values[index];
			eventualOut.enumIndexes[key] = index;
		} else {
			eventualOut[key] = dataRaw[key];
		}
	}

	console.log(dataRaw);
	console.log(derivedRaw);

	for (const [key, value] of Object.entries(config.derivedMetrics)) {
		if (value.type === "ENUM") {
			const index: integer = derivedRaw[key];
			eventualOut[key] = value.values[index];
			eventualOut.enumIndexes[key] = index;
		} else {
			eventualOut[key] = derivedRaw[key];
		}
	}

	for (const [key, value] of Object.entries(config.optionalMetrics)) {
		if (value.type === "ENUM") {
			const index: integer = dataRaw[key];
			eventualOut.optional[key] = value.values[index];
			eventualOut.optional.enumIndexes[key] = index;
		} else {
			eventualOut.optional[key] = dataRaw[key];
		}
	}

	console.log(eventualOut);

	DeleteUndefinedProps(eventualOut.optional);
	DeleteUndefinedProps(eventualOut);

	return eventualOut as any;
}
