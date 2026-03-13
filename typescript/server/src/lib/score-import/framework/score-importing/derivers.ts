import type { GPTDerivers } from "#game-implementations/types";
import type { KtLogger } from "#lib/log/log.js";
import type { MetricValue } from "tachi-common/types/metrics";

import { GPT_SERVER_IMPLEMENTATIONS } from "#game-implementations/game-implementations";
import {
	type ChartDocument,
	type DerivedMetrics,
	GetGPTConfig,
	type GPTString,
	type integer,
	type OptionalEnumIndexes,
	type ScoreData,
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
	chart: ChartDocument<GPT>,
) {
	const deriverImplementation: GPTDerivers<GPT> = GPT_SERVER_IMPLEMENTATIONS[gpt].derivers;

	const derivedMetrics: Record<string, MetricValue> = {};

	const gptConfig = GetGPTConfig(gpt);

	for (const [key, fn] of Object.entries(deriverImplementation)) {
		const metricConfig = gptConfig.derivedMetrics[key];

		if (!metricConfig) {
			throw new InternalFailure(
				`${gpt} has a deriver defined for '${key}', but no such field exists in the config?`,
			);
		}

		const value = fn(metrics, chart);

		derivedMetrics[key] = value;
	}

	return derivedMetrics as DerivedMetrics[GPT];
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
	chart: ChartDocument<GPT>,
	log: KtLogger,
) {
	const derivedMetrics = DeriveMetrics(gpt, dryScoreData, chart);

	const scoreData = {
		...dryScoreData,
		...derivedMetrics,
	} as unknown as ScoreData<GPT>;
	// ^ hacky force-cast because these types are *really* unstable.

	const { indexes, optionalIndexes } = CreateEnumIndexes(gpt, scoreData, log);

	// again, silly hacks aorund typesafety here because to be honest
	// this stuff is more generic than TS really should ever have to implement.
	scoreData.enumIndexes = indexes;
	scoreData.optional.enumIndexes = optionalIndexes;

	return scoreData;
}
