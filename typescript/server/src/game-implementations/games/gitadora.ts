import type { GPTServerImplementation } from "#game-implementations/types";

import { CreatePBMergeFor } from "#game-implementations/utils/pb-merge";
import { ProfileSumBestN } from "#game-implementations/utils/profile-calc";
import { SessionAvgBest10For } from "#game-implementations/utils/session-calc";
import { IsNullish } from "#utils/misc";
import { GITADORASkill } from "rg-stats";
import { GetGrade, GITADORA_GBOUNDARIES } from "tachi-common";

import { GoalFmtPercent, GoalOutOfFmtPercent, GradeGoalFormatter } from "./_common";

const GITADORA_IMPL: GPTServerImplementation<"gitadora:Dora" | "gitadora:Gita"> = {
	chartSpecificValidators: {},
	derivers: {
		grade: ({ percent }) => GetGrade(GITADORA_GBOUNDARIES, percent),
	},
	newDeriver: (scoreData, _chart) => ({
		grade: GetGrade(GITADORA_GBOUNDARIES, scoreData.percent),
	}),
	newCalcs: (scoreData, _derivedData, chart) => ({
		skill: GITADORASkill.calculate(scoreData.percent, chart.levelNum),
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
		skill: (scoreData, chart) => GITADORASkill.calculate(scoreData.percent, chart.levelNum),
	},
	newSessionCalcs: (arr) => ({
		skill: SessionAvgBest10For("skill")(arr),
	}),
	newProfileCalcs: async (game, playtype, userID) => ({
		naiveSkill: await ProfileSumBestN("skill", 50)(game, playtype, userID),
	}),
	classDerivers: (ratings) => {
		const sk = ratings.naiveSkill;

		if (IsNullish(sk)) {
			return { colour: null };
		}

		if (sk >= 8500) {
			return { colour: "RAINBOW" };
		} else if (sk >= 8000) {
			return { colour: "GOLD" };
		} else if (sk >= 7500) {
			return { colour: "SILVER" };
		} else if (sk >= 7000) {
			return { colour: "BRONZE" };
		} else if (sk >= 6500) {
			return { colour: "RED_GRD" };
		} else if (sk >= 6000) {
			return { colour: "RED" };
		} else if (sk >= 5500) {
			return { colour: "PURPLE_GRD" };
		} else if (sk >= 5000) {
			return { colour: "PURPLE" };
		} else if (sk >= 4500) {
			return { colour: "BLUE_GRD" };
		} else if (sk >= 4000) {
			return { colour: "BLUE" };
		} else if (sk >= 3500) {
			return { colour: "GREEN_GRD" };
		} else if (sk >= 3000) {
			return { colour: "GREEN" };
		} else if (sk >= 2500) {
			return { colour: "YELLOW_GRD" };
		} else if (sk >= 2000) {
			return { colour: "YELLOW" };
		} else if (sk >= 1500) {
			return { colour: "ORANGE_GRD" };
		} else if (sk >= 1000) {
			return { colour: "ORANGE" };
		}

		return { colour: "WHITE" };
	},
	sessionCalcs: { skill: SessionAvgBest10For("skill") },
	profileCalcs: { naiveSkill: ProfileSumBestN("skill", 50) },
	goalCriteriaFormatters: {
		percent: GoalFmtPercent,
	},
	goalProgressFormatters: {
		lamp: (pb) => pb.scoreData.lamp,
		percent: (pb) => `${pb.scoreData.percent.toFixed(2)}%`,
		grade: (pb, gradeIndex) =>
			GradeGoalFormatter(
				GITADORA_GBOUNDARIES,
				pb.scoreData.grade,
				pb.scoreData.percent,
				GITADORA_GBOUNDARIES[gradeIndex]!.name,
				(v) => `${v.toFixed(2)}%`,
			),
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
	scoreValidators: [],
};

export const GITADORA_GITA_IMPL: GPTServerImplementation<"gitadora:Gita"> = GITADORA_IMPL;

export const GITADORA_DORA_IMPL: GPTServerImplementation<"gitadora:Dora"> = GITADORA_IMPL;
