import type { GPTServerImplementation } from "#game-implementations/types";

import { CreatePBMergeFor } from "#game-implementations/utils/pb-merge";
import { ProfileAvgBestN } from "#game-implementations/utils/profile-calc";
import { SessionAvgBest10For } from "#game-implementations/utils/session-calc";
import { IsNullish } from "#utils/misc";
import { MaimaiRate } from "rg-stats";

import { GetGrade, MAIMAI_GBOUNDARIES } from "../../../../common/src";
import { GoalFmtPercent, GoalOutOfFmtPercent, GradeGoalFormatter } from "./_common";

export const MAIMAI_IMPL: GPTServerImplementation<"maimai:Single"> = {
	chartSpecificValidators: {
		percent: (percent, chart) => {
			if (percent < 0) {
				return "Percent cannot be negative.";
			}

			if (percent > chart.data.maxPercent) {
				return `Percent cannot be greater than ${chart.data.maxPercent} for this chart.`;
			}

			return true;
		},
	},
	derivers: {
		grade: ({ percent }, chart) => {
			if (percent === chart.data.maxPercent) {
				return "SSS+";
			}

			return GetGrade(MAIMAI_GBOUNDARIES, percent);
		},
	},
	newDeriver: (scoreData, chart) => ({
		grade:
			scoreData.percent === chart.data.maxPercent
				? "SSS+"
				: GetGrade(MAIMAI_GBOUNDARIES, scoreData.percent),
	}),
	newCalcs: (scoreData, _derivedData, chart) => ({
		rate: MaimaiRate.calculate(scoreData.percent, chart.data.maxPercent, chart.levelNum),
	}),
	pbRankingValues: (pb) => ({
		ranking: pb.scoreData.percent,
		tb1: pb.scoreData.enumIndexes.lamp,
		tb2: null,
		tb3: null,
		tb4: null,
		tb5: null,
	}),
	scoreCalcs: {
		rate: (scoreData, chart) =>
			MaimaiRate.calculate(scoreData.percent, chart.data.maxPercent, chart.levelNum),
	},
	newSessionCalcs: (arr) => ({
		rate: SessionAvgBest10For("rate")(arr),
	}),
	newProfileCalcs: async (game, playtype, userID) => ({
		naiveRate: await ProfileAvgBestN("rate", 30)(game, playtype, userID),
	}),
	newClassDerivers: (ratings) => {
		const rate = ratings.naiveRate;

		if (IsNullish(rate)) {
			return { colour: null };
		}

		if (rate >= 15) {
			return { colour: "RAINBOW" };
		} else if (rate >= 14.5) {
			return { colour: "GOLD" };
		} else if (rate >= 14) {
			return { colour: "SILVER" };
		} else if (rate >= 13) {
			return { colour: "BRONZE" };
		} else if (rate >= 12) {
			return { colour: "PURPLE" };
		} else if (rate >= 10) {
			return { colour: "RED" };
		} else if (rate >= 7) {
			return { colour: "YELLOW" };
		} else if (rate >= 4) {
			return { colour: "GREEN" };
		} else if (rate >= 2) {
			return { colour: "BLUE" };
		}

		return { colour: "WHITE" };
	},
	sessionCalcs: { rate: SessionAvgBest10For("rate") },
	profileCalcs: {
		naiveRate: ProfileAvgBestN("rate", 30),
	},
	classDerivers: {
		colour: (ratings) => {
			const rate = ratings.naiveRate;

			if (IsNullish(rate)) {
				return null;
			}

			if (rate >= 15) {
				return "RAINBOW";
			} else if (rate >= 14.5) {
				return "GOLD";
			} else if (rate >= 14) {
				return "SILVER";
			} else if (rate >= 13) {
				return "BRONZE";
			} else if (rate >= 12) {
				return "PURPLE";
			} else if (rate >= 10) {
				return "RED";
			} else if (rate >= 7) {
				return "YELLOW";
			} else if (rate >= 4) {
				return "GREEN";
			} else if (rate >= 2) {
				return "BLUE";
			}

			return "WHITE";
		},
	},
	goalCriteriaFormatters: {
		percent: GoalFmtPercent,
	},
	goalProgressFormatters: {
		percent: (pb) => `${pb.scoreData.percent.toFixed(2)}%`,
		lamp: (pb) => pb.scoreData.lamp,
		grade: (pb, gradeIndex) => {
			if (pb.scoreData.grade === "SSS+") {
				return "SSS+";
			}

			// gradeIndex is guaranteed to be a valid rank

			const goalGrade = MAIMAI_GBOUNDARIES[gradeIndex]!.name;

			// Grade SSS+ is chart-dependent, and it isn't possible to get the
			// max score/max percent from only the percent.
			//
			// As such, if the goal is to SSS+, we have to return the current rank+delta.
			if (goalGrade === "SSS+" && pb.scoreData.grade === "SSS") {
				const boundary =
					MAIMAI_GBOUNDARIES.find((c) => c.name === "SSS")?.lowerBound ?? 100;
				const delta = pb.scoreData.percent - boundary;

				return `SSS+${delta.toFixed(2)}%`;
			}

			return GradeGoalFormatter(
				MAIMAI_GBOUNDARIES,
				pb.scoreData.grade,
				pb.scoreData.percent,
				goalGrade,
				(v) => `${v.toFixed(2)}%`,
			);
		},
	},
	goalOutOfFormatters: {
		percent: GoalOutOfFmtPercent,
	},
	pbMergeFunctions: [
		CreatePBMergeFor("largest", "enumIndexes.lamp", "Best Lamp", (base, score) => {
			base.scoreData.lamp = score.scoreData.lamp;
		}),
	],
	defaultMergeRefName: "Best Percent",
	scoreValidators: [
		(s) => {
			if (s.scoreData.percent > 104) {
				return "Score cannot be greater than 104%.";
			}
		},
		(s) => {
			if (s.scoreData.lamp === "ALL PERFECT+" && !(s.scoreData.grade === "SSS+")) {
				return "Cannot have an ALL PERFECT+ without grade SSS+.";
			}

			if (s.scoreData.grade === "SSS+" && !(s.scoreData.lamp === "ALL PERFECT+")) {
				return "Cannot have grade SSS+ without an ALL PERFECT+";
			}
		},
		(s) => {
			let { great, good, miss } = s.scoreData.judgements;

			great ??= 0;
			good ??= 0;
			miss ??= 0;

			if (s.scoreData.lamp === "ALL PERFECT") {
				// `great`, `good` and `miss` are all coalesced to 0, so they're all
				// numbers, even if eslint doesn't think so.

				if (great + good + miss > 0) {
					return "Cannot have an ALL PERFECT with any non-perfect judgements.";
				}
			}

			if (s.scoreData.lamp === "FULL COMBO") {
				if (miss > 0) {
					return "Cannot have a FULL COMBO if the score has misses.";
				}
			}
		},
	],
};
