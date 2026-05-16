import DB from "#services/pg/db";
import mockApi, { CloseServerConnection } from "#test-utils/mock-api";
import { seedMinimalIidxSpChart, seedUser } from "#test-utils/pg-fixtures";
import { afterAll, describe, expect, it } from "vitest";

afterAll(() => CloseServerConnection());

async function seedGoalWithSub(chartId: string, userId: number) {
	const goalId = `G_test_${Date.now()}_${Math.random().toString(36).slice(2)}`;

	await DB.insertInto("goal")
		.values({
			id: goalId,
			game: "iidx-sp",
			name: "Test Goal",
			charts: JSON.stringify({ type: "single", data: chartId }),
			criteria: JSON.stringify({ mode: "single", key: "lamp", value: 7 }),
		})
		.execute();

	await DB.insertInto("goal_sub")
		.values({
			goal_id: goalId,
			user_id: userId,
			achieved: false,
			time_achieved: null,
			progress: null,
			progress_human: "NO DATA",
			out_of: 7,
			out_of_human: "FULL COMBO",
			last_interaction: null,
			was_instantly_achieved: false,
			was_assigned_standalone: true,
		})
		.execute();

	return goalId;
}

describe("GET /api/v1/games/:game/targets/goals/popular", () => {
	it("returns 200 with an array of goals", async () => {
		const res = await mockApi.get("/api/v1/games/iidx-sp/targets/goals/popular");

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(Array.isArray(res.body.body)).toBe(true);
	});

	it("returns the most-subscribed goals sorted by popularity", async () => {
		const chartId = await seedMinimalIidxSpChart();
		const goalId = `G_pop_${Date.now()}`;

		await DB.insertInto("goal")
			.values({
				id: goalId,
				game: "iidx-sp",
				name: "Popular Goal",
				charts: JSON.stringify({ type: "single", data: chartId }),
				criteria: JSON.stringify({ mode: "single", key: "lamp", value: 7 }),
			})
			.execute();

		const { id: uid1 } = await seedUser({ username: `pop_u1_${Date.now()}` });
		const { id: uid2 } = await seedUser({ username: `pop_u2_${Date.now()}` });

		for (const uid of [uid1, uid2]) {
			await DB.insertInto("goal_sub")
				.values({
					goal_id: goalId,
					user_id: uid,
					achieved: false,
					time_achieved: null,
					progress: null,
					progress_human: "NO DATA",
					out_of: 7,
					out_of_human: "FULL COMBO",
					last_interaction: null,
					was_instantly_achieved: false,
					was_assigned_standalone: true,
				})
				.execute();
		}

		const res = await mockApi.get("/api/v1/games/iidx-sp/targets/goals/popular");

		expect(res.status).toBe(200);

		const goalIds = (res.body.body as Array<{ goalID: string }>).map((g) => g.goalID);

		expect(goalIds).toContain(goalId);
	});
});

describe("POST /api/v1/games/:game/targets/goals/format", () => {
	it("returns a human-readable goal name for valid input", async () => {
		const chartId = await seedMinimalIidxSpChart();

		const res = await mockApi.post("/api/v1/games/iidx-sp/targets/goals/format").send({
			charts: { type: "single", data: chartId },
			criteria: { mode: "single", key: "lamp", value: 7 },
		});

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(typeof res.body.body).toBe("string");
		expect(res.body.body.length).toBeGreaterThan(0);
	});

	it("returns 400 for an invalid chart reference", async () => {
		const res = await mockApi.post("/api/v1/games/iidx-sp/targets/goals/format").send({
			charts: { type: "single", data: "C_does_not_exist" },
			criteria: { mode: "single", key: "lamp", value: 7 },
		});

		expect(res.status).toBe(400);
		expect(res.body.success).toBe(false);
	});

	it("returns 400 for an invalid criteria key", async () => {
		const chartId = await seedMinimalIidxSpChart();

		const res = await mockApi.post("/api/v1/games/iidx-sp/targets/goals/format").send({
			charts: { type: "single", data: chartId },
			criteria: { mode: "single", key: "not_a_real_metric", value: 0 },
		});

		expect(res.status).toBe(400);
		expect(res.body.success).toBe(false);
	});
});

describe("GET /api/v1/games/:game/targets/goals/:goalID", () => {
	it("returns goal + subscribers + parentQuests", async () => {
		const chartId = await seedMinimalIidxSpChart();
		const { id: detailUserId } = await seedUser({ username: `goal_detail_${Date.now()}` });
		const goalId = await seedGoalWithSub(chartId, detailUserId);

		const res = await mockApi.get(`/api/v1/games/iidx-sp/targets/goals/${goalId}`);

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.body.goal.goalID).toBe(goalId);
		expect(Array.isArray(res.body.body.goalSubs)).toBe(true);
		expect(Array.isArray(res.body.body.users)).toBe(true);
		expect(Array.isArray(res.body.body.parentQuests)).toBe(true);
	});

	it("returns 404 when the goal does not exist", async () => {
		const res = await mockApi.get("/api/v1/games/iidx-sp/targets/goals/G_no_such_goal");

		expect(res.status).toBe(404);
		expect(res.body.success).toBe(false);
	});

	it("returns 404 when the goal belongs to a different game", async () => {
		const chartId = await seedMinimalIidxSpChart();
		const { id: gameCheckUserId } = await seedUser({
			username: `goal_game_check_${Date.now()}`,
		});
		const goalId = await seedGoalWithSub(chartId, gameCheckUserId);

		const res = await mockApi.get(`/api/v1/games/sdvx/targets/goals/${goalId}`);

		expect(res.status).toBe(404);
	});

	it("parentQuestlines on quest detail returns proper QuestlineDocument shape", async () => {
		const suffix = `${Date.now()}`;
		const qlId = `ql-goal-test-${suffix}`;
		const qId = `q-goal-test-${suffix}`;
		const chartId = await seedMinimalIidxSpChart();
		const goalId = `G_ql_shape_${suffix}`;

		await DB.insertInto("goal")
			.values({
				id: goalId,
				game: "iidx-sp",
				name: "Shape test goal",
				charts: JSON.stringify({ type: "single", data: chartId }),
				criteria: JSON.stringify({ mode: "single", key: "lamp", value: 4 }),
			})
			.execute();

		await DB.insertInto("quest")
			.values({
				id: qId,
				game: "iidx-sp",
				name: "Shape test quest",
				description: "d",
				quest_data: JSON.stringify([{ title: "s", goals: [{ goalID: goalId }] }]),
			})
			.execute();

		await DB.insertInto("questline")
			.values({
				id: qlId,
				game: "iidx-sp",
				name: "Shape test questline",
				description: "d",
			})
			.execute();

		await DB.insertInto("questline_quest")
			.values({
				questline_id: qlId,
				quest_id: qId,
				sort_order: 0,
			})
			.execute();

		const res = await mockApi.get(`/api/v1/games/iidx-sp/targets/quests/${qId}`);

		expect(res.status).toBe(200);

		const ql = (
			res.body.body.parentQuestlines as Array<{
				game: string;
				questlineID: string;
				quests: string[];
			}>
		).find((x) => x.questlineID === qlId);

		expect(ql).toBeDefined();
		expect(ql?.game).toBe("iidx-sp");
		expect(Array.isArray(ql?.quests)).toBe(true);
	});
});
