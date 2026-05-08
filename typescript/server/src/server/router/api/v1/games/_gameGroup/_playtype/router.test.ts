import DB from "#services/pg/db";
import mockApi, { CloseServerConnection } from "#test-utils/mock-api";
import { seedUser } from "#test-utils/pg-fixtures";
import { Testing511Song, Testing511SPA } from "#test-utils/test-data";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

afterAll(() => CloseServerConnection());

async function seedMinimalIidxSpCorpus() {
	const chartId = Testing511SPA.chartID;

	await DB.insertInto("song")
		.values({
			id: Testing511Song.id,
			legacy_id: 1,
			game_group: "iidx",
			title: Testing511Song.title,
			artist: Testing511Song.artist,
			search_terms: Testing511Song.searchTerms,
			alt_titles: Testing511Song.altTitles,
			data: Testing511Song.data,
			fts_document: "",
		})
		.execute();

	await DB.insertInto("chart")
		.values({
			id: chartId,
			legacy_id: chartId,
			game: "iidx-sp",
			song_id: Testing511Song.id,
			difficulty: Testing511SPA.difficulty,
			level: Testing511SPA.level,
			level_num: Testing511SPA.levelNum,
			is_primary: Testing511SPA.isPrimary,
			versions: Testing511SPA.versions,
			data: Testing511SPA.data,
		})
		.execute();

	const now = new Date().toISOString();

	await DB.insertInto("game_profile")
		.values({
			user_id: 1,
			game: "iidx-sp",
			ratings: JSON.stringify({ BPI: 1 }),
			classes: JSON.stringify({}),
		})
		.execute();

	await DB.insertInto("score")
		.values({
			id: "seed_score_iidx",
			user_id: 1,
			chart_id: chartId,
			game: "iidx-sp",
			session_id: null,
			import_id: null,
			data: JSON.stringify({}),
			derived_data: JSON.stringify({}),
			judgements: JSON.stringify({}),
			calculated_data: JSON.stringify({}),
			meta: JSON.stringify({}),
			time_achieved: now,
			time_added: now,
			highlight: false,
			comment: null,
		})
		.execute();
}

describe("GET /api/v1/games/:game", () => {
	beforeEach(async () => {
		await seedUser({ username: "gpt_info_user" });
		await seedMinimalIidxSpCorpus();
	});

	it.todo(
		"GET /api/v1/games/:v3Game stats (chart/player/score): blocked - Express matches GET /games/:gameGroup before GET /games/:game, so iidx-sp is rejected as a game group",
	);

	it("returns 400 for an unsupported game slug", async () => {
		const res = await mockApi.get("/api/v1/games/__not_a_real_game_slug__");

		expect(res.status).toBe(400);
	});
});

describe("GET /api/v1/games/:game/leaderboard", () => {
	beforeEach(async () => {
		await seedUser({ username: "lb_u1" });
		await seedMinimalIidxSpCorpus();

		await seedUser({ username: "lb_u2" });
		await seedUser({ username: "lb_u3" });

		await DB.insertInto("game_profile")
			.values([
				{
					user_id: 2,
					game: "iidx-sp",
					ratings: JSON.stringify({ BPI: 100 }),
					classes: JSON.stringify({}),
				},
				{
					user_id: 3,
					game: "iidx-sp",
					ratings: JSON.stringify({ BPI: 50 }),
					classes: JSON.stringify({}),
				},
			])
			.execute();
	});

	it("returns the leaderboard for this game", async () => {
		const res = await mockApi.get("/api/v1/games/iidx-sp/leaderboard");

		expect(res.status).toBe(200);
		expect(res.body.body.gameStats.length).toBe(3);
		expect(res.body.body.users.length).toBe(3);

		expect(res.body.body.gameStats).toEqual(
			expect.arrayContaining([expect.objectContaining({ userID: 1, game: "iidx-sp" })]),
		);
		expect(res.body.body.users).toEqual(
			expect.arrayContaining([expect.objectContaining({ id: 1 })]),
		);
	});

	it("returns 400 for an unknown profile algorithm", async () => {
		const res = await mockApi.get("/api/v1/games/iidx-sp/leaderboard?alg=naiveRating");

		expect(res.status).toBe(400);
	});

	it("sorts by the requested algorithm when provided", async () => {
		const res = await mockApi.get("/api/v1/games/iidx-sp/leaderboard?alg=BPI");

		expect(res.status).toBe(200);

		expect(res.body.body.gameStats.map((e: { userID: number }) => e.userID)).toEqual([2, 3, 1]);
	});

	it("gives the same rank to users tied on the profile algorithm (next rank skips)", async () => {
		await DB.updateTable("game_profile")
			.set({ ratings: JSON.stringify({ BPI: 100 }) })
			.where("user_id", "=", 3)
			.execute();

		const res = await mockApi.get("/api/v1/games/iidx-sp/leaderboard?alg=BPI&limit=10");

		expect(res.status).toBe(200);
		const stats = res.body.body.gameStats as Array<{
			rank: number;
			userID: number;
		}>;
		const r2 = stats.find((s) => s.userID === 2)!;
		const r3 = stats.find((s) => s.userID === 3)!;
		expect(r2.rank).toBe(1);
		expect(r3.rank).toBe(1);
		expect(stats.find((s) => s.userID === 1)!.rank).toBe(3);
	});
});

describe("GET /api/v1/games/:game/players", () => {
	beforeEach(async () => {
		await seedUser({ username: "players_sink" });
		await seedUser({ username: "scrimblo" });
		await seedUser({ username: "scrimblo_2" });
		await seedUser({ username: "scrimblo_3" });
		await seedUser({ username: "cloudy" });

		await DB.insertInto("game_profile")
			.values([
				{
					user_id: 2,
					game: "iidx-sp",
					ratings: JSON.stringify({}),
					classes: JSON.stringify({}),
				},
				{
					user_id: 3,
					game: "iidx-dp",
					ratings: JSON.stringify({}),
					classes: JSON.stringify({}),
				},
				{
					user_id: 4,
					game: "bms-7k",
					ratings: JSON.stringify({}),
					classes: JSON.stringify({}),
				},
				{
					user_id: 5,
					game: "iidx-sp",
					ratings: JSON.stringify({}),
					classes: JSON.stringify({}),
				},
			])
			.execute();
	});

	it("finds users that match the search string for this GPT", async () => {
		const res = await mockApi.get("/api/v1/games/iidx-sp/players?search=scrimblo");

		expect(res.status).toBe(200);
		expect(res.body.body).toEqual([expect.objectContaining({ id: 2 })]);
	});

	it("returns an empty list when nothing matches", async () => {
		const res = await mockApi.get("/api/v1/games/iidx-sp/players?search=nobody");

		expect(res.status).toBe(200);
		expect(res.body.body).toEqual([]);
	});

	it("scopes results to the requested GPT", async () => {
		const res = await mockApi.get("/api/v1/games/iidx-dp/players?search=scrimblo");

		expect(res.status).toBe(200);
		expect(res.body.body).toEqual([expect.objectContaining({ id: 3 })]);
	});

	it("returns 400 when search is missing", async () => {
		const res = await mockApi.get("/api/v1/games/iidx-dp/players");

		expect(res.status).toBe(400);
	});
});
