import type { GPTServerImplementation } from "#game-implementations/types";
import type { GPTStrings } from "tachi-common";

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
	SDVXLIKE_PB_MERGERS,
	SDVXLIKE_PROFILE_CALCS,
	SDVXLIKE_SCORE_CALCS,
	SDVXLIKE_SCORE_VALIDATORS,
	SDVXLIKE_SESSION_CALCS,
} from "./_common";

const USC_IMPL: GPTServerImplementation<GPTStrings["usc"]> = {
	derivers: SDVXLIKE_DERIVERS,
	newDeriver: SDVXLIKE_NEW_DERIVER,
	newCalcs: SDVXLIKE_NEW_CALCS,
	newSessionCalcs: SDVXLIKE_NEW_SESSION_CALCS,
	newProfileCalcs: SDVXLIKE_NEW_PROFILE_CALCS,
	classDerivers: SDVXLIKE_CLASS_DERIVERS,
	pbRankingValues: (pb) => ({
		ranking: pb.scoreData.score,
		tb1: pb.scoreData.enumIndexes.lamp,
		tb2: null,
		tb3: null,
		tb4: null,
		tb5: null,
	}),
	chartSpecificValidators: {},
	scoreCalcs: SDVXLIKE_SCORE_CALCS,
	sessionCalcs: SDVXLIKE_SESSION_CALCS,
	profileCalcs: SDVXLIKE_PROFILE_CALCS,
	goalCriteriaFormatters: SDVXLIKE_GOAL_FMT,
	goalProgressFormatters: SDVXLIKE_GOAL_PG_FMT,
	goalOutOfFormatters: SDVXLIKE_GOAL_OO_FMT,
	pbMergeFunctions: SDVXLIKE_PB_MERGERS,
	defaultMergeRefName: SDVXLIKE_DEFAULT_MERGE_NAME,
	scoreValidators: SDVXLIKE_SCORE_VALIDATORS,
};

export const USC_KEYBOARD_IMPL: GPTServerImplementation<"usc:Keyboard"> = USC_IMPL;

export const USC_CONTROLLER_IMPL: GPTServerImplementation<"usc:Controller"> = USC_IMPL;
