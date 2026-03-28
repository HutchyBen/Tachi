import type { GPTServerImplementation } from "#game-implementations/types";

import { CreatePBMergeFor } from "#game-implementations/utils/pb-merge";

import {
	SDVXLIKE_CLASS_DERIVERS,
	SDVXLIKE_DEFAULT_MERGE_NAME,
	SDVXLIKE_DERIVERS,
	SDVXLIKE_GOAL_FMT,
	SDVXLIKE_GOAL_OO_FMT,
	SDVXLIKE_GOAL_PG_FMT,
	SDVXLIKE_NEW_CALCS,
	SDVXLIKE_NEW_DERIVER,
	SDVXLIKE_NEW_PROFILE_CALCS,
	SDVXLIKE_NEW_SESSION_CALCS,
	SDVXLIKE_PROFILE_CALCS,
	SDVXLIKE_SCORE_CALCS,
	SDVXLIKE_SCORE_VALIDATORS,
	SDVXLIKE_SESSION_CALCS,
} from "./_common";

export const SDVX_IMPL: GPTServerImplementation<"sdvx:Single"> = {
	derivers: SDVXLIKE_DERIVERS,
	newDeriver: SDVXLIKE_NEW_DERIVER,
	newCalcs: SDVXLIKE_NEW_CALCS,
	newSessionCalcs: SDVXLIKE_NEW_SESSION_CALCS,
	newProfileCalcs: SDVXLIKE_NEW_PROFILE_CALCS,
	classDerivers: SDVXLIKE_CLASS_DERIVERS,
	pbRankingValues: (pb) => ({
		ranking: pb.scoreData.score,
		tb1: pb.scoreData.enumIndexes.lamp,
		tb2: pb.scoreData.optional.exScore ?? null,
		tb3: null,
		tb4: null,
		tb5: null,
	}),
	chartSpecificValidators: {
		exScore: (exScore, chart) => {
			if (exScore < 0) {
				return `EX Score must be non-negative. Got ${exScore}`;
			}

			// TODO
			// gotta figure this out somehow?
			// we need to store notecounts or something. For now, just allow
			// any +ve integer, I guess.

			return true;
		},
	},
	scoreCalcs: SDVXLIKE_SCORE_CALCS,
	sessionCalcs: SDVXLIKE_SESSION_CALCS,
	profileCalcs: SDVXLIKE_PROFILE_CALCS,
	goalCriteriaFormatters: SDVXLIKE_GOAL_FMT,
	goalProgressFormatters: SDVXLIKE_GOAL_PG_FMT,
	goalOutOfFormatters: SDVXLIKE_GOAL_OO_FMT,
	pbMergeFunctions: [
		CreatePBMergeFor("largest", "enumIndexes.lamp", "Best Lamp", (base, score) => {
			base.scoreData.lamp = score.scoreData.lamp;
		}),
		CreatePBMergeFor("largest", "optional.exScore", "Best EX Score", (base, score) => {
			base.scoreData.optional.exScore = score.scoreData.optional.exScore;
		}),
	],
	defaultMergeRefName: SDVXLIKE_DEFAULT_MERGE_NAME,
	scoreValidators: SDVXLIKE_SCORE_VALIDATORS,
};
