import type { GPTServerImplementation, PBMergeFunction } from "#game-implementations/types";

import { CreatePBMergeFor } from "#game-implementations/utils/pb-merge";
import { type GPTStrings, IIDXLIKE_GBOUNDARIES } from "tachi-common";

import {
	GoalFmtPercent,
	GoalOutOfFmtPercent,
	GradeGoalFormatter,
	IIDXLIKE_PB_RANKING_VALUES,
	IIDXLIKE_SCORE_DERIVER,
	IIDXLIKE_SCORE_VALIDATORS,
	IIDXLIKE_VALIDATORS,
	SGL_PROFILE_CALCS,
	SGL_SCORE_CALCS,
	SGL_SESSION_CALCS,
} from "./_common";

const BMS_PMS_MERGERS: Array<PBMergeFunction<GPTStrings["bms" | "pms"]>> = [
	CreatePBMergeFor("largest", "enumIndexes.lamp", "Best Lamp", (base, lamp) => {
		base.scoreData.lamp = lamp.scoreData.lamp;

		// technically these don't exist on PMS scores but since undefined is a
		// legal value for these properties it works out.
		base.scoreData.optional.gauge = lamp.scoreData.optional.gauge;
		base.scoreData.optional.gaugeHistory = lamp.scoreData.optional.gaugeHistory;
		base.scoreData.optional.gaugeHistoryEasy = lamp.scoreData.optional.gaugeHistoryEasy;
		base.scoreData.optional.gaugeHistoryGroove = lamp.scoreData.optional.gaugeHistoryGroove;
		base.scoreData.optional.gaugeHistoryHard = lamp.scoreData.optional.gaugeHistoryHard;
	}),
	CreatePBMergeFor("smallest", "optional.bp", "Lowest BP", (base, bp) => {
		base.scoreData.optional.bp = bp.scoreData.optional.bp;
	}),
];

// bms and pms currently have *identical*
// implementations. Nice.

const BMS_IMPL: GPTServerImplementation<GPTStrings["bms" | "pms"]> = {
	scoreDeriver: IIDXLIKE_SCORE_DERIVER,
	scoreCalcs: SGL_SCORE_CALCS,
	sessionCalcs: SGL_SESSION_CALCS,
	profileCalcs: SGL_PROFILE_CALCS,
	classDerivers: (_ratings) => ({}),
	chartSpecificValidators: IIDXLIKE_VALIDATORS,
	pbRankingValues: IIDXLIKE_PB_RANKING_VALUES,
	goalCriteriaFormatters: {
		percent: GoalFmtPercent,
		score: (v) => `Get a score of ${v} on`,
	},
	goalProgressFormatters: {
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
		grade: (pb, goalValue) =>
			GradeGoalFormatter(
				IIDXLIKE_GBOUNDARIES,
				pb.scoreData.grade,
				pb.scoreData.percent,
				IIDXLIKE_GBOUNDARIES[goalValue]!.name,
				// use notecount to turn the percent deltas into whole ex-scores.
				(deltaPercent) => {
					const max = Math.floor(pb.scoreData.score / (pb.scoreData.percent / 100));

					return ((deltaPercent / 100) * max).toFixed(0);
				},
			),
	},
	goalOutOfFormatters: {
		percent: GoalOutOfFmtPercent,
		// don't insert commas or anything.
		score: (m) => m.toString(),
	},
	pbMergeFunctions: BMS_PMS_MERGERS,
	defaultMergeRefName: "Best Score",
	scoreValidators: IIDXLIKE_SCORE_VALIDATORS,
};

export const BMS_14K_IMPL: GPTServerImplementation<"bms:14K"> = BMS_IMPL;

export const BMS_7K_IMPL: GPTServerImplementation<"bms:7K"> = BMS_IMPL;

export const PMS_CONTROLLER_IMPL: GPTServerImplementation<"pms:Controller"> = BMS_IMPL;
export const PMS_KEYBOARD_IMPL: GPTServerImplementation<"pms:Keyboard"> = BMS_IMPL;
