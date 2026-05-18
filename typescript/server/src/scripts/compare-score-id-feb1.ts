/**
 * Compare CreateScoreID output at HEAD vs eed374649 (2026-02-01).
 *
 * Usage: bun run src/scripts/compare-score-id-feb1.ts
 */
import type { DryScore } from "#lib/score-import/framework/common/types";
import {
	buildCanonicalDryScore,
	SCORE_ID_ALT_CHART_ID,
	SCORE_ID_ALT_USER_ID,
	SCORE_ID_CANONICAL_CHART_ID,
	SCORE_ID_CANONICAL_USER_ID,
	SCORE_ID_SNAPSHOT_GAMES,
} from "#lib/score-import/framework/score-importing/score-id-fixtures";
import { collectScoreIdVariants } from "#lib/score-import/framework/score-importing/score-id-fixtures";
import { dmf } from "#test-utils/misc";
import fjsh from "fast-json-stable-hash";
import { GetGPTConfig } from "/tmp/tachi-feb1/common/src/config/config.ts";
import {
	GetGameConfig,
	LEGACY_GameToGPTString,
	type ConfScoreMetric,
	type V3Game,
} from "tachi-common";

const LEGACY_COMMIT = "eed37464970d6863454508ea5064e627b8fd0a33";

type ScoreIdElements = Record<string, number | string | null>;

function isEnumMetric(
	conf: ConfScoreMetric,
): conf is ConfScoreMetric & { type: "ENUM"; values: Array<string> } {
	return conf.type === "ENUM";
}

function baselineProvidedValue(conf: ConfScoreMetric): number | string {
	switch (conf.type) {
		case "INTEGER":
			return 500_000;
		case "DECIMAL":
			return 97.53;
		case "ENUM": {
			if (isEnumMetric(conf) && conf.minimumRelevantValue) {
				return conf.minimumRelevantValue;
			}

			return isEnumMetric(conf) ? conf.values[Math.min(2, conf.values.length - 1)]! : "CLEAR";
		}
		default:
			throw new Error(`Unsupported provided metric type: ${(conf as ConfScoreMetric).type}`);
	}
}

function alternateProvidedValue(conf: ConfScoreMetric, baseline: number | string): number | string {
	switch (conf.type) {
		case "INTEGER":
			return baseline === 500_000 ? 123_456 : 500_000;
		case "DECIMAL":
			return baseline === 97.53 ? 88.88 : 97.53;
		case "ENUM": {
			if (!isEnumMetric(conf)) {
				throw new Error("Expected enum metric");
			}

			const idx = conf.values.indexOf(baseline as string);

			return conf.values[(idx + 1) % conf.values.length]!;
		}
		default:
			throw new Error(`Unsupported provided metric type: ${(conf as ConfScoreMetric).type}`);
	}
}

function baselineOptionalPartOfScoreIdValue(conf: ConfScoreMetric): number | string {
	switch (conf.type) {
		case "INTEGER":
			return 777;
		case "DECIMAL":
			return 12.34;
		case "ENUM": {
			if (isEnumMetric(conf) && conf.minimumRelevantValue) {
				return conf.minimumRelevantValue;
			}

			return isEnumMetric(conf) ? conf.values[0]! : "0";
		}
		default:
			throw new Error(
				`Unsupported partOfScoreID optional metric type: ${(conf as ConfScoreMetric).type}`,
			);
	}
}

function buildLegacyElements(
	game: V3Game,
	userID: number,
	dryScore: DryScore,
	chartID: string,
): ScoreIdElements {
	const gptString = LEGACY_GameToGPTString(game);
	const gptConfig = GetGPTConfig(gptString);
	const elements: ScoreIdElements = { userID, chartID };

	for (const metric of Object.keys(gptConfig.providedMetrics)) {
		elements[metric] = dryScore.scoreData[metric as keyof typeof dryScore.scoreData] as
			| number
			| string;
	}

	for (const [metric, conf] of Object.entries(gptConfig.optionalMetrics)) {
		if (conf.partOfScoreID) {
			elements[`optional.${metric}`] = dryScore.scoreData.optional[metric] ?? null;
		}
	}

	return elements;
}

function createLegacyScoreID(
	game: V3Game,
	userID: number,
	dryScore: DryScore,
	chartID: string,
): string {
	const elements = buildLegacyElements(game, userID, dryScore, chartID);

	return `T${fjsh.hash(elements, "sha256")}`;
}

function buildCurrentElements(
	game: V3Game,
	userID: number,
	dryScore: DryScore,
	legacyChartID: string,
): ScoreIdElements {
	const gameConfig = GetGameConfig(game);
	const elements: ScoreIdElements = { userID, chartID: legacyChartID };

	for (const metric of Object.keys(gameConfig.providedMetrics)) {
		elements[metric] = dryScore.scoreData[metric as keyof typeof dryScore.scoreData] as
			| number
			| string;
	}

	for (const [metric, conf] of Object.entries(gameConfig.optionalMetrics)) {
		if (conf.partOfScoreID) {
			elements[`optional.${metric}`] = dryScore.scoreData.optional[metric] ?? null;
		}
	}

	return elements;
}

function resolveVariantInputs(
	game: V3Game,
	variant: string,
): { dryScore: DryScore; userID: number; chartID: string } {
	const dryScore = buildCanonicalDryScore(game);
	const gameConfig = GetGameConfig(game);

	if (variant === "baseline") {
		return {
			dryScore,
			userID: SCORE_ID_CANONICAL_USER_ID,
			chartID: SCORE_ID_CANONICAL_CHART_ID,
		};
	}

	if (variant === "userID") {
		return { dryScore, userID: SCORE_ID_ALT_USER_ID, chartID: SCORE_ID_CANONICAL_CHART_ID };
	}

	if (variant === "chartID") {
		return { dryScore, userID: SCORE_ID_CANONICAL_USER_ID, chartID: SCORE_ID_ALT_CHART_ID };
	}

	if (variant.startsWith("provided.")) {
		const metric = variant.slice("provided.".length);
		const conf = gameConfig.providedMetrics[metric]!;
		const alternate = alternateProvidedValue(conf, baselineProvidedValue(conf));

		return {
			dryScore: dmf(dryScore, { scoreData: { [metric]: alternate } }),
			userID: SCORE_ID_CANONICAL_USER_ID,
			chartID: SCORE_ID_CANONICAL_CHART_ID,
		};
	}

	if (variant.startsWith("optional.")) {
		const rest = variant.slice("optional.".length);
		const dot = rest.lastIndexOf(".");
		const metric = rest.slice(0, dot);
		const mode = rest.slice(dot + 1);
		const conf = gameConfig.optionalMetrics[metric]!;

		let value: number | string | null | undefined;

		if (mode === "set") {
			value = baselineOptionalPartOfScoreIdValue(conf);
		} else if (mode === "null") {
			value = null;
		} else if (mode === "unset") {
			value = undefined;
		} else if (mode === "ignored") {
			value = 99_999;
		} else {
			throw new Error(`Unknown optional variant ${variant}`);
		}

		return {
			dryScore: dmf(dryScore, { scoreData: { optional: { [metric]: value } } }),
			userID: SCORE_ID_CANONICAL_USER_ID,
			chartID: SCORE_ID_CANONICAL_CHART_ID,
		};
	}

	throw new Error(`Unknown variant ${variant}`);
}

function collectLegacyScoreIdVariants(game: V3Game): Record<string, string> {
	const dryScore = buildCanonicalDryScore(game);
	const gameConfig = GetGameConfig(game);

	const variants: Record<string, string> = {
		baseline: createLegacyScoreID(
			game,
			SCORE_ID_CANONICAL_USER_ID,
			dryScore,
			SCORE_ID_CANONICAL_CHART_ID,
		),
		userID: createLegacyScoreID(
			game,
			SCORE_ID_ALT_USER_ID,
			dryScore,
			SCORE_ID_CANONICAL_CHART_ID,
		),
		chartID: createLegacyScoreID(game, SCORE_ID_CANONICAL_USER_ID, dryScore, SCORE_ID_ALT_CHART_ID),
	};

	for (const [metric, conf] of Object.entries(gameConfig.providedMetrics)) {
		const alternate = alternateProvidedValue(conf, baselineProvidedValue(conf));

		variants[`provided.${metric}`] = createLegacyScoreID(
			game,
			SCORE_ID_CANONICAL_USER_ID,
			dmf(dryScore, { scoreData: { [metric]: alternate } }),
			SCORE_ID_CANONICAL_CHART_ID,
		);
	}

	for (const [metric, conf] of Object.entries(gameConfig.optionalMetrics)) {
		if (!conf.partOfScoreID) {
			continue;
		}

		const setValue = baselineOptionalPartOfScoreIdValue(conf);

		variants[`optional.${metric}.set`] = createLegacyScoreID(
			game,
			SCORE_ID_CANONICAL_USER_ID,
			dmf(dryScore, { scoreData: { optional: { [metric]: setValue } } }),
			SCORE_ID_CANONICAL_CHART_ID,
		);

		variants[`optional.${metric}.null`] = createLegacyScoreID(
			game,
			SCORE_ID_CANONICAL_USER_ID,
			dmf(dryScore, { scoreData: { optional: { [metric]: null } } }),
			SCORE_ID_CANONICAL_CHART_ID,
		);

		variants[`optional.${metric}.unset`] = createLegacyScoreID(
			game,
			SCORE_ID_CANONICAL_USER_ID,
			dmf(dryScore, { scoreData: { optional: { [metric]: undefined } } }),
			SCORE_ID_CANONICAL_CHART_ID,
		);
	}

	const firstNonScoreIdOptional = Object.entries(gameConfig.optionalMetrics).find(
		([, conf]) => !conf.partOfScoreID,
	);

	if (firstNonScoreIdOptional) {
		const [metric] = firstNonScoreIdOptional;

		variants[`optional.${metric}.ignored`] = createLegacyScoreID(
			game,
			SCORE_ID_CANONICAL_USER_ID,
			dmf(dryScore, { scoreData: { optional: { [metric]: 99_999 } } }),
			SCORE_ID_CANONICAL_CHART_ID,
		);
	}

	return variants;
}

function main() {
	let total = 0;
	let matched = 0;
	const mismatches: Array<string> = [];
	const configDrift: Array<string> = [];

	for (const game of SCORE_ID_SNAPSHOT_GAMES) {
		const currentVariants = collectScoreIdVariants(game);
		const legacyVariants = collectLegacyScoreIdVariants(game);

		for (const [variant, currentId] of Object.entries(currentVariants)) {
			total++;
			const legacyId = legacyVariants[variant];

			if (currentId === legacyId) {
				matched++;
				continue;
			}

			mismatches.push(`${game} ${variant}: current=${currentId} legacy=${legacyId}`);

			const { dryScore, userID, chartID } = resolveVariantInputs(game, variant);
			const currentElements = buildCurrentElements(game, userID, dryScore, chartID);
			const legacyElements = buildLegacyElements(game, userID, dryScore, chartID);

			if (JSON.stringify(currentElements) === JSON.stringify(legacyElements)) {
				configDrift.push(`${game} ${variant}: hash inputs match but ids differ (algorithm drift!)`);
			} else {
				configDrift.push(`${game} ${variant}: hash inputs differ (likely config drift)`);
			}
		}
	}

	console.log(`CreateScoreID comparison vs ${LEGACY_COMMIT} (2026-02-01)`);
	console.log(`Games: ${SCORE_ID_SNAPSHOT_GAMES.length}, variants checked: ${total}`);
	console.log(`Matched: ${matched}/${total}`);

	if (mismatches.length === 0) {
		console.log("All inputs produce identical score ids.");
		process.exit(0);
	}

	console.log("\nMismatches:");
	for (const line of mismatches) {
		console.log(`  ${line}`);
	}

	console.log("\nDiagnosis:");
	for (const line of configDrift) {
		console.log(`  ${line}`);
	}

	process.exit(1);
}

main();
