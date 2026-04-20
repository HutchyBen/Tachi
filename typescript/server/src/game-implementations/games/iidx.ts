import type {
	GameImplementation,
	GPTGoalFormatters,
	GPTGoalProgressFormatters,
	GPTProfileCalcs,
	GPTSessionCalcs,
	PBMergeFunction,
} from "#game-implementations/types";

import { CreatePBMergeFor } from "#game-implementations/utils/pb-merge";
import { ProfileAvgBestN } from "#game-implementations/utils/profile-calc";
import { SessionAvgBest10For } from "#game-implementations/utils/session-calc";
import { PoyashiBPI } from "rg-stats";
import { IIDXLIKE_GBOUNDARIES } from "tachi-common";

import {
	GoalFmtPercent,
	GoalOutOfFmtPercent,
	GradeGoalFormatter,
	IIDXLIKE_PB_RANKING_VALUES,
	IIDXLIKE_SCORE_DERIVER,
	IIDXLIKE_SCORE_VALIDATORS,
	IIDXLIKE_VALIDATORS,
} from "./_common";

/** `iidx:SP` / `iidx:DP` as v3 games. */
type IIDXGames = "iidx-dp" | "iidx-sp";

const IIDX_SESSION_CALCS: GPTSessionCalcs<IIDXGames> = (arr) => ({
	BPI: SessionAvgBest10For("BPI")(arr),
	ktLampRating: SessionAvgBest10For("ktLampRating")(arr),
});

const IIDX_PROFILE_CALCS: GPTProfileCalcs<IIDXGames> = async (game, userID) => {
	const [BPI, ktLampRating] = await Promise.all([
		ProfileAvgBestN("BPI", 20, true)(game, userID),
		ProfileAvgBestN("ktLampRating", 20)(game, userID),
	]);

	return { BPI, ktLampRating };
};

const IIDX_MERGERS: Array<PBMergeFunction<IIDXGames>> = [
	CreatePBMergeFor("largest", { type: "REGULAR", metric: "lamp" }, "Best Lamp", (base, lamp) => {
		base.scoreData.lamp = lamp.scoreData.lamp;

		// Update lamp related iidx-specific info from the lampPB.
		base.scoreData.optional.gsmEasy = lamp.scoreData.optional.gsmEasy;
		base.scoreData.optional.gsmNormal = lamp.scoreData.optional.gsmNormal;
		base.scoreData.optional.gsmHard = lamp.scoreData.optional.gsmHard;
		base.scoreData.optional.gsmEXHard = lamp.scoreData.optional.gsmEXHard;

		base.scoreData.optional.gauge = lamp.scoreData.optional.gauge;
		base.scoreData.optional.gaugeHistory = lamp.scoreData.optional.gaugeHistory;

		base.scoreData.optional.comboBreak = lamp.scoreData.optional.comboBreak;
	}),
	CreatePBMergeFor("smallest", { type: "REGULAR", metric: "bp" }, "Lowest BP", (base, bp) => {
		base.scoreData.optional.bp = bp.scoreData.optional.bp;
	}),
];

const IIDX_GOAL_FMT: GPTGoalFormatters<IIDXGames> = {
	percent: GoalFmtPercent,

	// don't want commas
	score: (v) => `Get a score of ${v} on`,
};

const IIDX_GOAL_OO_FMT: GPTGoalFormatters<IIDXGames> = {
	percent: GoalOutOfFmtPercent,
	// don't insert commas or anything.
	score: (m) => m.toString(),
};

const IIDX_GOAL_PG_FMT: GPTGoalProgressFormatters<IIDXGames> = {
	percent: (pb) => `${pb.scoreData.percent.toFixed(2)}%`,

	// 4519 -> "4519". Don't add commas or anything.
	score: (pb) => pb.scoreData.score.toString(),

	lamp: (pb) => {
		// if bp exists
		if (typeof pb.scoreData.optional.bp === "number") {
			return `${pb.scoreData.lamp} (BP: ${pb.scoreData.optional.bp})`;
		}

		return pb.scoreData.lamp;
	},
	grade: (pb, gradeIndex) =>
		GradeGoalFormatter(
			IIDXLIKE_GBOUNDARIES,
			pb.scoreData.grade,
			pb.scoreData.percent,
			IIDXLIKE_GBOUNDARIES[gradeIndex]!.name,

			// use notecount to turn the percent deltas into whole ex-scores.
			(deltaPercent) => {
				const max = Math.floor(pb.scoreData.score / (pb.scoreData.percent / 100));

				const v = (deltaPercent / 100) * max;

				return Math.round(v).toFixed(0);
			},
		),
};

export const IIDX_SP_IMPL: GameImplementation<"iidx-sp"> = {
	scoreDeriver: IIDXLIKE_SCORE_DERIVER,
	chartSpecificValidators: IIDXLIKE_VALIDATORS,
	pbRankingValues: IIDXLIKE_PB_RANKING_VALUES,
	scoreCalcs: (scoreData, _derivedData, chart) => {
		const bpi =
			chart.data.kaidenAverage === null || chart.data.worldRecord === null
				? null
				: PoyashiBPI.calculate(
						scoreData.score,
						chart.data.kaidenAverage,
						chart.data.worldRecord,
						chart.data.notecount * 2,
						chart.data.bpiCoefficient,
					);

		const ncValue = chart.data.ncTier?.value ?? chart.levelNum;
		const hcValue = Math.max(chart.data.hcTier?.value ?? 0, ncValue);
		const exhcValue = Math.max(chart.data.exhcTier?.value ?? 0, hcValue);

		let ktLampRating: number;

		switch (scoreData.lamp) {
			case "FULL COMBO":
			case "EX HARD CLEAR": {
				ktLampRating = exhcValue;
				break;
			}

			case "HARD CLEAR": {
				ktLampRating = hcValue;
				break;
			}

			case "CLEAR": {
				ktLampRating = ncValue;
				break;
			}

			default:
				ktLampRating = 0;
		}

		return { BPI: bpi, ktLampRating };
	},
	sessionCalcs: IIDX_SESSION_CALCS,
	profileCalcs: IIDX_PROFILE_CALCS,
	classDerivers: (_ratings) => ({}),
	goalCriteriaFormatters: IIDX_GOAL_FMT,
	goalProgressFormatters: IIDX_GOAL_PG_FMT,
	goalOutOfFormatters: IIDX_GOAL_OO_FMT,
	pbMergeFunctions: IIDX_MERGERS,
	defaultMergeRefName: "Best Score",
	scoreValidators: IIDXLIKE_SCORE_VALIDATORS,
	chartDataRelevantFields: [
		"levelNum",
		"data.notecount",
		"data.kaidenAverage",
		"data.worldRecord",
		"data.bpiCoefficient",
		"data.ncTier",
		"data.hcTier",
		"data.exhcTier",
	],
};

export const IIDX_DP_IMPL: GameImplementation<"iidx-dp"> = {
	scoreDeriver: IIDXLIKE_SCORE_DERIVER,
	chartSpecificValidators: IIDXLIKE_VALIDATORS,
	pbRankingValues: IIDXLIKE_PB_RANKING_VALUES,
	scoreCalcs: (scoreData, _derivedData, chart) => {
		const bpi =
			chart.data.kaidenAverage === null || chart.data.worldRecord === null
				? null
				: PoyashiBPI.calculate(
						scoreData.score,
						chart.data.kaidenAverage,
						chart.data.worldRecord,
						chart.data.notecount * 2,
						chart.data.bpiCoefficient,
					);

		const ecValue = chart.data.dpTier?.value ?? chart.levelNum;

		let ktLampRating: number;

		switch (scoreData.lamp) {
			case "FULL COMBO":
			case "EX HARD CLEAR":
			case "HARD CLEAR":
			case "CLEAR":
			case "EASY CLEAR": {
				ktLampRating = ecValue;
				break;
			}

			default:
				ktLampRating = 0;
		}

		return { BPI: bpi, ktLampRating };
	},
	sessionCalcs: IIDX_SESSION_CALCS,
	profileCalcs: IIDX_PROFILE_CALCS,
	classDerivers: (_ratings) => ({}),
	goalCriteriaFormatters: IIDX_GOAL_FMT,
	goalProgressFormatters: IIDX_GOAL_PG_FMT,
	goalOutOfFormatters: IIDX_GOAL_OO_FMT,
	pbMergeFunctions: IIDX_MERGERS,
	defaultMergeRefName: "Best Score",
	scoreValidators: IIDXLIKE_SCORE_VALIDATORS,
	chartDataRelevantFields: [
		"levelNum",
		"data.notecount",
		"data.kaidenAverage",
		"data.worldRecord",
		"data.bpiCoefficient",
		"data.dpTier",
	],
};
