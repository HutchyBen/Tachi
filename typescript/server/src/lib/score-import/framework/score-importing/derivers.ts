import type { KtLogger } from "#lib/log/log";
import { GPT_SERVER_IMPLEMENTATIONS } from "#game-implementations/game-implementations";
import {
	GetGPTConfig,
	type GPTString,
	type integer,
	type MONGO_ChartDocument,
	type MONGO_ScoreData,
	type MongoDerivedMetrics,
	type OptionalEnumIndexes,
	type ScoreEnumIndexes,
} from "tachi-common";

import type { DryScore, DryScoreData } from "../common/types";

import { InternalFailure } from "../common/converter-failures";

/**
 * Given the providedMetrics and chart this score is on, derive the rest of the metrics
 * we want to store.
 */
function DeriveMetrics<GPT extends GPTString>(
	gpt: GPT,
	metrics: DryScoreData<GPT>,
	chart: MONGO_ChartDocument<GPT>,
) {
	return GPT_SERVER_IMPLEMENTATIONS[gpt].scoreDeriver(
		metrics as MONGO_ScoreData<GPT>,
		chart,
	) as MongoDerivedMetrics[GPT];
}

export function CreateEnumIndexes<GPT extends GPTString>(gpt: GPT, metrics: any, log: KtLogger) {
	const gptConfig = GetGPTConfig(gpt);

	const indexes: Record<string, integer> = {};
	const optionalIndexes: Record<string, integer> = {};

	for (const [key, conf] of [
		...Object.entries(gptConfig.providedMetrics),
		...Object.entries(gptConfig.derivedMetrics),
	]) {
		if (conf.type !== "ENUM") {
			continue;
		}

		const index = conf.values.indexOf(metrics[key]);

		if (index === -1) {
			log.error(
				{ metrics, key, conf },
				`Got an invalid enum value of ${metrics[key]} for ${gpt} ${key} on DryScore. Can't add indexes?`,
			);

			throw new InternalFailure(
				`Got an invalid enum value of ${metrics[key]} for ${gpt} ${key} on DryScore. Can't add indexes?`,
			);
		}

		indexes[key] = index;
	}

	for (const [key, conf] of [
		...Object.entries(gptConfig.providedMetrics),
		...Object.entries(gptConfig.derivedMetrics),
	]) {
		if (conf.type !== "ENUM") {
			continue;
		}

		// skip undefined metrics
		if (!metrics.optional[key]) {
			continue;
		}

		const index = conf.values.indexOf(metrics.optional[key]);

		if (index === -1) {
			log.error(
				{ metrics, key, conf },
				`Got an invalid enum value of ${metrics.optional[key]} for ${gpt} optional.${key} on DryScore. Can't add indexes?`,
			);

			throw new InternalFailure(
				`Got an invalid enum value of ${metrics.optional[key]} for ${gpt} optional.${key} on DryScore. Can't add indexes?`,
			);
		}

		indexes[key] = index;
	}

	return {
		indexes: indexes as ScoreEnumIndexes<GPT>,
		optionalIndexes: optionalIndexes as OptionalEnumIndexes<GPT>,
	};
}

/**
 * Return a full piece of scoreData.
 */
export function CreateFullScoreData<GPT extends GPTString>(
	gpt: GPT,
	dryScoreData: DryScore<GPT>["scoreData"],
	chart: MONGO_ChartDocument<GPT>,
	log: KtLogger,
) {
	const derivedMetrics = DeriveMetrics(gpt, dryScoreData, chart);

	const scoreData = {
		...dryScoreData,
		...derivedMetrics,
	} as unknown as MONGO_ScoreData<GPT>;
	// ^ hacky force-cast because these types are *really* unstable.

	const { indexes, optionalIndexes } = CreateEnumIndexes(gpt, scoreData, log);

	// again, silly hacks aorund typesafety here because to be honest
	// this stuff is more generic than TS really should ever have to implement.
	scoreData.enumIndexes = indexes;
	scoreData.optional.enumIndexes = optionalIndexes;

	return scoreData;
}
