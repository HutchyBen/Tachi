import DB from "#services/pg/db";
import { seedUser } from "#test-utils/pg-fixtures";
import { describe, expect, it } from "vitest";

import { GetAllRankings, GetUsersRankingAndOutOf } from "./user";

// ─── helpers ─────────────────────────────────────────────────────────────────

async function seedGameStats(
	userId: number,
	ktLampRating: number | null,
	game: "iidx-sp" = "iidx-sp",
) {
	await DB.insertInto("game_profile")
		.values({
			user_id: userId,
			game,
			ratings: JSON.stringify({ ktLampRating }),
			classes: JSON.stringify({}),
		})
		.execute();
}

function makeStats(userId: number, ktLampRating: number | null) {
	return {
		userID: userId,
		game: "iidx" as const,
		playtype: "SP" as const,
		ratings: { ktLampRating },
		classes: {},
	};
}

// ─── GetUsersRankingAndOutOf ──────────────────────────────────────────────────

describe("GetUsersRankingAndOutOf", () => {
	it("returns ranking 1 and outOf 1 when user is the only player", async () => {
		const { id } = await seedUser();
		await seedGameStats(id, 10);

		const result = await GetUsersRankingAndOutOf(makeStats(id, 10));

		expect(result).toEqual({ ranking: 1, outOf: 1 });
	});

	it("returns ranking 1 when the user has the highest rating", async () => {
		const user1 = await seedUser({ username: "top_user" });
		const user2 = await seedUser({ username: "lower_user" });
		await seedGameStats(user1.id, 20);
		await seedGameStats(user2.id, 10);

		const result = await GetUsersRankingAndOutOf(makeStats(user1.id, 20));

		expect(result).toEqual({ ranking: 1, outOf: 2 });
	});

	it("returns ranking 2 when one user has a higher rating", async () => {
		const user1 = await seedUser({ username: "top_user" });
		const user2 = await seedUser({ username: "second_user" });
		await seedGameStats(user1.id, 20);
		await seedGameStats(user2.id, 10);

		const result = await GetUsersRankingAndOutOf(makeStats(user2.id, 10));

		expect(result).toEqual({ ranking: 2, outOf: 2 });
	});

	it("ranks correctly with many players", async () => {
		const ratings = [5, 10, 15, 20, 25];
		const users = await Promise.all(
			ratings.map((_, i) => seedUser({ username: `player_${i}` })),
		);
		await Promise.all(users.map((u, i) => seedGameStats(u.id, ratings[i]!)));

		// Player with rating 15 has 2 players above them (20, 25), so ranking = 3
		const result = await GetUsersRankingAndOutOf(makeStats(users[2]!.id, 15));

		expect(result).toEqual({ ranking: 3, outOf: 5 });
	});

	it("handles tied ratings — only strictly greater counts", async () => {
		const user1 = await seedUser({ username: "tied_a" });
		const user2 = await seedUser({ username: "tied_b" });
		const user3 = await seedUser({ username: "tied_c" });
		await seedGameStats(user1.id, 10);
		await seedGameStats(user2.id, 10);
		await seedGameStats(user3.id, 10);

		// No one is strictly greater than 10, so all rank #1
		const result = await GetUsersRankingAndOutOf(makeStats(user1.id, 10));

		expect(result).toEqual({ ranking: 1, outOf: 3 });
	});

	it("uses explicit alg parameter instead of default", async () => {
		const user1 = await seedUser({ username: "bpi_high" });
		const user2 = await seedUser({ username: "bpi_low" });

		await DB.insertInto("game_profile")
			.values({
				user_id: user1.id,
				game: "iidx-sp",
				ratings: JSON.stringify({ ktLampRating: 5, BPI: 80 }),
				classes: JSON.stringify({}),
			})
			.execute();
		await DB.insertInto("game_profile")
			.values({
				user_id: user2.id,
				game: "iidx-sp",
				ratings: JSON.stringify({ ktLampRating: 20, BPI: 30 }),
				classes: JSON.stringify({}),
			})
			.execute();

		// user2 has higher ktLampRating but lower BPI
		// Checking BPI ranking for user1: user1 BPI=80, user2 BPI=30, user1 is #1
		const result = await GetUsersRankingAndOutOf(
			{ userID: user1.id, game: "iidx", playtype: "SP", ratings: { BPI: 80 }, classes: {} },
			"BPI" as never,
		);

		expect(result).toEqual({ ranking: 1, outOf: 2 });
	});

	it("returns ranking 1 when user rating is null (no one can be strictly greater than null)", async () => {
		const user1 = await seedUser({ username: "null_rater" });
		const user2 = await seedUser({ username: "other_player" });
		await seedGameStats(user1.id, null);
		await seedGameStats(user2.id, 10);

		const result = await GetUsersRankingAndOutOf(makeStats(user1.id, null));

		expect(result).toEqual({ ranking: 1, outOf: 2 });
	});

	it("does not include rows from different games in the count", async () => {
		const iidxUser = await seedUser({ username: "iidx_player" });
		const sdvxUser = await seedUser({ username: "sdvx_player" });

		await seedGameStats(iidxUser.id, 10, "iidx-sp");
		await DB.insertInto("game_profile")
			.values({
				user_id: sdvxUser.id,
				game: "sdvx",
				ratings: JSON.stringify({ VF6: 99 }),
				classes: JSON.stringify({}),
			})
			.execute();

		const result = await GetUsersRankingAndOutOf(makeStats(iidxUser.id, 10));

		// outOf should only count iidx-sp players
		expect(result).toEqual({ ranking: 1, outOf: 1 });
	});
});

// ─── GetAllRankings ───────────────────────────────────────────────────────────

describe("GetAllRankings", () => {
	it("returns rankings for all profile rating algorithms", async () => {
		const user1 = await seedUser({ username: "top_player" });
		const user2 = await seedUser({ username: "bot_player" });

		await DB.insertInto("game_profile")
			.values({
				user_id: user1.id,
				game: "iidx-sp",
				ratings: JSON.stringify({ ktLampRating: 20, BPI: 50 }),
				classes: JSON.stringify({}),
			})
			.execute();
		await DB.insertInto("game_profile")
			.values({
				user_id: user2.id,
				game: "iidx-sp",
				ratings: JSON.stringify({ ktLampRating: 10, BPI: 25 }),
				classes: JSON.stringify({}),
			})
			.execute();

		const stats = {
			userID: user1.id,
			game: "iidx" as const,
			playtype: "SP" as const,
			ratings: { ktLampRating: 20, BPI: 50 },
			classes: {},
		};

		const result = await GetAllRankings(stats);

		// user1 is #1 in both algorithms
		expect(result.ktLampRating).toEqual({ ranking: 1, outOf: 2 });
		expect(result.BPI).toEqual({ ranking: 1, outOf: 2 });
	});
});
