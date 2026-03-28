import type { DeepPartial } from "#utils/types";

import deepmerge from "deepmerge";
import {
	type GameGroup,
	type GPTString,
	type integer,
	type MONGO_ChartDocument,
	type MONGO_GoalDocument,
	type MONGO_GoalSubscriptionDocument,
	type MONGO_ImportDocument,
	type MONGO_NotificationDocument,
	type MONGO_PBScoreDocument,
	type MONGO_ScoreData,
	type MONGO_ScoreDocument,
	type MONGO_UGPTSettingsDocument,
	type MONGO_UserDocument,
	type MONGO_UserGameStats,
	MongoChartLegacyId,
	type Playtype,
} from "tachi-common";

import {
	FakeGameSettings,
	FakeImport,
	FakeNotification,
	FakeOtherUser,
	HC511Goal,
	HC511UserGoal,
	TestingDDRSPScorePB,
	TestingIIDXSPScore,
	TestingIIDXSPScorePB,
	TestingJubeatPB,
	TestingSDVXAlbidaChart,
	TestingSDVXPB,
	TestingSDVXScore,
} from "./test-data";

/**
 * Async Generator To Array
 */
export async function agta(ag: AsyncIterable<unknown> | Iterable<unknown>) {
	const a = [];

	for await (const el of ag) {
		a.push(el);
	}

	return a;
}

/**
 * Deep-modify an object. This is a wrapper around deepmerge that returns proper types.
 */
export function dmf<T extends object>(base: T, modifant: DeepPartial<T>): T {
	// @ts-expect-error LOLDEEPMERGETYPES
	return deepmerge(base, modifant, {
		// The new array should replace the former one, instead of joining them together.
		arrayMerge: (originalArray, newArray) => newArray as Array<unknown>,
	});
}

/**
 * Make a fake user for testing. This automatically sets the username to something
 * unique (to avoid index collisions)
 *
 * @param userID - The userID this fake user should have.
 */
export function mkFakeUser(userID: integer, modifant: DeepPartial<MONGO_UserDocument> = {}) {
	return dmf(FakeOtherUser, {
		id: userID,
		username: `user${userID}`,
		usernameLowercase: `user${userID}`,
		...modifant,
	});
}

export function mkFakeGameSettings(
	userID: integer,
	game: GameGroup,
	playtype: Playtype,
	modifant: DeepPartial<MONGO_UGPTSettingsDocument> = {},
) {
	return dmf(FakeGameSettings, {
		userID,
		game,
		playtype,
		...modifant,
	});
}

export function mkFakeImport(modifant: DeepPartial<MONGO_ImportDocument> = {}) {
	return dmf(FakeImport, modifant);
}

export function mkFakeScoreIIDXSP(modifant: DeepPartial<MONGO_ScoreDocument<"iidx:SP">> = {}) {
	return dmf(TestingIIDXSPScore, modifant);
}

export function mkFakeScoreSDVX(modifant: DeepPartial<MONGO_ScoreDocument<"sdvx:Single">> = {}) {
	return dmf(TestingSDVXScore, modifant);
}

export function mkFakePBIIDXSP(modifant: DeepPartial<MONGO_PBScoreDocument<"iidx:SP">> = {}) {
	return dmf(TestingIIDXSPScorePB, modifant);
}

export function mkFakePBDDRSP(modifant: DeepPartial<MONGO_PBScoreDocument<"ddr:SP">> = {}) {
	return dmf(TestingDDRSPScorePB, modifant);
}

export function mkFakePBJubeat(modifant: DeepPartial<MONGO_PBScoreDocument<"jubeat:Single">> = {}) {
	return dmf(TestingJubeatPB, modifant);
}

export function mkFakeNotification(modifant: DeepPartial<MONGO_NotificationDocument> = {}) {
	return dmf(FakeNotification, modifant);
}

export function mkFakeGoal(modifant: DeepPartial<MONGO_GoalDocument> = {}) {
	return dmf(HC511Goal, modifant);
}

export function mkFakeGoalSub(modifant: DeepPartial<MONGO_GoalSubscriptionDocument> = {}) {
	return dmf(HC511UserGoal, modifant);
}

export function mkFakeGameStats(
	userID: integer,
	modifant: DeepPartial<MONGO_UserGameStats> = {},
): MONGO_UserGameStats {
	return dmf(
		{
			userID,
			game: "iidx",
			playtype: "SP",
			classes: {},
			ratings: {},
		},
		// @ts-expect-error idk lol types
		modifant,
	);
}

export function mkFakeSDVXChart(
	chartID: string,
	modifant: DeepPartial<MONGO_ChartDocument<"sdvx:Single">> = {},
) {
	return dmf(TestingSDVXAlbidaChart, {
		chartID,
		...modifant,
	});
}

export function mkFakeSDVXPB(modifant: DeepPartial<MONGO_PBScoreDocument<"sdvx:Single">> = {}) {
	return dmf(TestingSDVXPB, modifant);
}

export function mkMockPB<GPT extends GPTString>(
	game: GameGroup,
	playtype: Playtype,
	chart: MONGO_ChartDocument<GPT>,
	scoreData: MONGO_ScoreData<GPT>,
): MONGO_PBScoreDocument<GPT> {
	return {
		userID: 1,
		composedFrom: [{ name: "Best Percent", scoreID: `TEST_${game}:${playtype}_SCORE` }],
		game,
		playtype,
		highlight: false,
		isPrimary: true,
		rankingData: { outOf: 1, rank: 1, rivalRank: null },
		songID: chart.songID,
		chartID: MongoChartLegacyId(chart),
		calculatedData: {},
		scoreData,
		timeAchieved: null,
	};
}

export function mkMockScore<GPT extends GPTString>(
	game: GameGroup,
	playtype: Playtype,
	chart: MONGO_ChartDocument<GPT>,
	scoreData: MONGO_ScoreData<GPT>,
): MONGO_ScoreDocument<GPT> {
	// @ts-expect-error whatever lol
	return {
		userID: 1,
		game,
		playtype,
		highlight: false,
		isPrimary: true,
		songID: chart.songID,
		chartID: MongoChartLegacyId(chart),
		calculatedData: {},
		scoreData,
		timeAchieved: null,
		comment: null,
		importType: null,
		scoreID: `TEST_${game}:${playtype}_SCORE`,
		scoreMeta: {},
		service: "TESTING",
		timeAdded: 1,
	};
}
