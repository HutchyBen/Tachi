import type { GPTServerImplementation } from "#game-implementations/types";

import { CreatePBMergeFor } from "#game-implementations/utils/pb-merge";
import { ProfileSumBestN } from "#game-implementations/utils/profile-calc";
import { SessionAvgBest10For } from "#game-implementations/utils/session-calc";
import { CuratorSkill } from "rg-stats";
import { FmtNum, GetGrade, MUSECA_GBOUNDARIES } from "tachi-common";

import { GoalFmtScore, GoalOutOfFmtScore, GradeGoalFormatter } from "./_common";

export const MUSECA_IMPL: GPTServerImplementation<"museca:Single"> = {
	chartSpecificValidators: {},
	derivers: {
		grade: ({ score }) => GetGrade(MUSECA_GBOUNDARIES, score),
	},
	newDeriver: (scoreData, _chart) => ({
		grade: GetGrade(MUSECA_GBOUNDARIES, scoreData.score),
	}),
	newCalcs: (scoreData, _derivedData, chart) => ({
		curatorSkill: CuratorSkill.calculate(scoreData.score, chart.levelNum),
	}),
	pbRankingValues: (pb) => ({
		ranking: pb.scoreData.score,
		tb1: pb.scoreData.enumIndexes.lamp,
		tb2: null,
		tb3: null,
		tb4: null,
		tb5: null,
	}),
	scoreCalcs: {
		curatorSkill: (scoreData, chart) => CuratorSkill.calculate(scoreData.score, chart.levelNum),
	},
	newSessionCalcs: (arr) => ({
		curatorSkill: SessionAvgBest10For("curatorSkill")(arr),
	}),
	newProfileCalcs: async (game, playtype, userID) => ({
		curatorSkill: await ProfileSumBestN("curatorSkill", 20)(game, playtype, userID),
	}),
	classDerivers: (_ratings) => ({}),
	sessionCalcs: { curatorSkill: SessionAvgBest10For("curatorSkill") },
	profileCalcs: {
		curatorSkill: ProfileSumBestN("curatorSkill", 20),
	},
	goalCriteriaFormatters: {
		score: GoalFmtScore,
	},
	goalProgressFormatters: {
		score: (pb) => FmtNum(pb.scoreData.score),
		lamp: (pb) => pb.scoreData.lamp,
		grade: (pb, gradeIndex) =>
			GradeGoalFormatter(
				MUSECA_GBOUNDARIES,
				pb.scoreData.grade,
				pb.scoreData.score,
				MUSECA_GBOUNDARIES[gradeIndex]!.name,
			),
	},
	goalOutOfFormatters: {
		score: GoalOutOfFmtScore,
	},
	pbMergeFunctions: [
		CreatePBMergeFor("largest", "enumIndexes.lamp", "Best Lamp", (base, score) => {
			base.scoreData.lamp = score.scoreData.lamp;
		}),
	],
	defaultMergeRefName: "Best Score",
	scoreValidators: [
		(s) => {
			if (s.scoreData.lamp === "PERFECT CONNECT ALL" && s.scoreData.score !== 1_000_000) {
				return "A PERFECT CONNECT ALL must have a score of 1 million.";
			}

			if (s.scoreData.score === 1_000_000 && s.scoreData.lamp !== "PERFECT CONNECT ALL") {
				return "A perfect score of 1 million must have a lamp of PERFECT CONNECT ALL.";
			}
		},
		(s) => {
			let { miss, near } = s.scoreData.judgements;

			miss ??= 0;
			near ??= 0;

			if (s.scoreData.lamp === "PERFECT CONNECT ALL" && miss + near > 0) {
				return "Cannot have a PERFECT CONNECT ALL with any nears or misses.";
			}

			if (s.scoreData.lamp === "CONNECT ALL" && miss > 0) {
				return "Cannot have a CONNECT ALL with any misses.";
			}
		},
		(s) => {
			if (s.scoreData.score < 800_000 && s.scoreData.lamp !== "FAILED") {
				return "A score of <800k must be a fail.";
			}

			if (s.scoreData.score >= 800_000 && s.scoreData.lamp === "FAILED") {
				return "A score of >=800k must be a clear.";
			}
		},
	],
};
