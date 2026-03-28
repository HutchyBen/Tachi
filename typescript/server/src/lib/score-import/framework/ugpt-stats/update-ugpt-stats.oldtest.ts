import { log } from "#lib/log/log.js";
import MONGODB_KILL from "#services/mongo/db";
import ResetDBState from "#test-utils/resets";
import { TestingIIDXSPScorePB } from "#test-utils/test-data";
import crypto from "crypto";
import deepmerge from "deepmerge";
import t from "tap";

import { UpdateUsersGamePlaytypeStats } from "./update-ugpt-stats";

// more of an integration test
t.test("#UpdateUsersGamePlaytypeStats", (t) => {
	t.beforeEach(ResetDBState);
	t.beforeEach(async () => {
		await MONGODB_KILL["personal-bests"].insert(TestingIIDXSPScorePB);
	});

	t.test(
		"Should create new UserGameStats and UserGameSettings if the user has none",
		async (t) => {
			await MONGODB_KILL["game-stats"].remove({});
			await MONGODB_KILL["game-settings"].remove({});

			const res = await UpdateUsersGamePlaytypeStats("iidx", "SP", 1, null, log);

			t.strictSame(res, [], "Should return an empty object");

			const gs = await MONGODB_KILL["game-stats"].findOne();

			t.hasStrict(
				gs,
				{
					game: "iidx",
					playtype: "SP",
					userID: 1,
					ratings: { ktLampRating: 0 },
					classes: {},
				},
				"Should insert an appropriate game-stats object",
			);

			const settings = await MONGODB_KILL["game-settings"].findOne();

			t.hasStrict(settings, {
				game: "iidx",
				playtype: "SP",
				userID: 1,
				preferences: {},
			});

			t.end();
		},
	);

	t.test("Should update UserGameStats if the user has one", async (t) => {
		await MONGODB_KILL["game-stats"].remove({});

		await MONGODB_KILL["game-stats"].insert({
			game: "iidx",
			playtype: "SP",
			userID: 1,
			ratings: { ktLampRating: 0 },
			classes: {},
		});

		// insert some mock scores
		const ratings = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

		await MONGODB_KILL["personal-bests"].insert(
			ratings.map((e) =>
				deepmerge(TestingIIDXSPScorePB, {
					chartID: crypto.randomBytes(20).toString("hex"),
					calculatedData: {
						ktLampRating: e,
					},
				}),
			),
		);

		const res = await UpdateUsersGamePlaytypeStats("iidx", "SP", 1, null, log);

		t.strictSame(res, [], "Should return an empty object");

		const gs = await MONGODB_KILL["game-stats"].findOne();

		t.hasStrict(
			gs,
			{
				game: "iidx",
				playtype: "SP",
				userID: 1,
				ratings: { ktLampRating: ratings.reduce((a, e) => a + e, 0) / 20 },
				classes: {},
			},
			"Should update the game-stats object",
		);

		t.end();
	});

	t.test("Should return class deltas", async (t) => {
		await MONGODB_KILL["game-stats"].remove({});

		await MONGODB_KILL["game-stats"].insert({
			game: "iidx",
			playtype: "SP",
			userID: 1,
			ratings: { ktLampRating: 0 },

			classes: {},
		});

		const res = await UpdateUsersGamePlaytypeStats(
			"iidx",
			"SP",
			1,
			() => ({ dan: "KAIDEN" }),
			log,
		);

		t.strictSame(
			res,
			[
				{
					game: "iidx",
					set: "dan",
					playtype: "SP",
					old: null,
					new: "KAIDEN",
				},
			],
			"Should return the class delta",
		);

		const gs = await MONGODB_KILL["game-stats"].findOne();

		t.hasStrict(
			gs,
			{
				game: "iidx",
				playtype: "SP",
				userID: 1,
				ratings: { ktLampRating: 0 },
				classes: {
					dan: "KAIDEN",
				},
			},
			"Should update the game-stats object",
		);

		t.end();
	});

	t.test("Should return updated class deltas", async (t) => {
		await MONGODB_KILL["game-stats"].remove({});

		await MONGODB_KILL["game-stats"].insert({
			game: "iidx",
			playtype: "SP",
			userID: 1,
			ratings: { ktLampRating: 0 },
			classes: {
				dan: "CHUUDEN",
			},
		});

		const res = await UpdateUsersGamePlaytypeStats(
			"iidx",
			"SP",
			1,
			() => ({ dan: "KAIDEN" }),
			log,
		);

		t.strictSame(
			res,
			[
				{
					game: "iidx",
					set: "dan",
					playtype: "SP",
					old: "CHUUDEN",
					new: "KAIDEN",
				},
			],
			"Should return the updated class delta",
		);

		const gs = await MONGODB_KILL["game-stats"].findOne();

		t.hasStrict(
			gs,
			{
				game: "iidx",
				playtype: "SP",
				userID: 1,
				ratings: { ktLampRating: 0 },
				classes: {
					dan: "KAIDEN",
				},
			},
			"Should update the game-stats object",
		);

		t.end();
	});

	t.end();
});
