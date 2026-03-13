import {
	type DerivedMetrics,
	GetGPTConfig,
	type GPTString,
	type OptionalMetrics,
	type ProvidedMetrics,
	type ScoreData,
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

function splitScoreData(gpt: GPTString, scoreData: ScoreData): RetVal<GPTString> {
	switch (gpt) {
		case "iidx:SP": {
			const { grade, lamp, percent, score, optional } =
				scoreData as unknown as ScoreData<"iidx:SP">;

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
				scoreData as unknown as ScoreData<"iidx:DP">;

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
				scoreData as unknown as ScoreData<"museca:Single">;

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
				scoreData as unknown as ScoreData<"chunithm:Single">;

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
				scoreData as unknown as ScoreData<"bms:7K">;

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
				scoreData as unknown as ScoreData<"bms:14K">;

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
				scoreData as unknown as ScoreData<"gitadora:Gita">;

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
				scoreData as unknown as ScoreData<"gitadora:Dora">;

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
				scoreData as unknown as ScoreData<"jubeat:Single">;

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
				scoreData as unknown as ScoreData<"maimai:Single">;

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
				scoreData as unknown as ScoreData<"maimaidx:Single">;

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
				scoreData as unknown as ScoreData<"popn:9B">;

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
				scoreData as unknown as ScoreData<"sdvx:Single">;

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
				scoreData as unknown as ScoreData<"usc:Controller">;

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
				scoreData as unknown as ScoreData<"usc:Keyboard">;

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
				scoreData as unknown as ScoreData<"wacca:Single">;

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
				scoreData as unknown as ScoreData<"pms:Controller">;

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
				scoreData as unknown as ScoreData<"pms:Keyboard">;

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
				scoreData as unknown as ScoreData<"itg:Stamina">;

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
				scoreData as unknown as ScoreData<"arcaea:Touch">;

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
				scoreData as unknown as ScoreData<"ongeki:Single">;

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
			const { grade, lamp, score, optional } = scoreData as unknown as ScoreData<"ddr:SP">;

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
			const { grade, lamp, score, optional } = scoreData as unknown as ScoreData<"ddr:DP">;

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
	scoreData: ScoreData,
): { data: unknown; derived: unknown } {
	const { data, derived } = splitScoreData(gpt, scoreData);

	const config = GetGPTConfig(gpt);

	return {
		data: applyOrdinals(data, config.providedMetrics as any),
		derived: applyOrdinals(derived, config.derivedMetrics as any),
	};
}
