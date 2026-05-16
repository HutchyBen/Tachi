import DB from "#services/pg/db";
import mockApi, { CloseServerConnection } from "#test-utils/mock-api";
import { seedMinimalIidxSpChart } from "#test-utils/pg-fixtures";
import { afterAll, describe, expect, it } from "vitest";

afterAll(() => CloseServerConnection());

async function seedQuest(suffix: string, goalId?: string) {
	const questId = `q-rt-${suffix}`;
	const questData = goalId ? [{ title: "Section", goals: [{ goalID: goalId }] }] : [];

	await DB.insertInto("quest")
		.values({
			id: questId,
			game: "iidx-sp",
			name: `Quest ${suffix}`,
			description: `Description for ${suffix}`,
			quest_data: JSON.stringify(questData),
		})
		.execute();

	return questId;
}

describe("GET /api/v1/games/:game/targets/quests", () => {
	it("returns quests matching the search term", async () => {
		const suffix = `${Date.now()}`;
		const questId = await seedQuest(suffix);

		const res = await mockApi.get(
			`/api/v1/games/iidx-sp/targets/quests?search=Quest+${suffix}`,
		);

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);

		const ids = (res.body.body.quests as Array<{ questID: string }>).map((q) => q.questID);

		expect(ids).toContain(questId);
	});

	it("returns empty arrays when no quests match the search", async () => {
		const res = await mockApi.get(
			"/api/v1/games/iidx-sp/targets/quests?search=this_will_never_match_zzz_xyz",
		);

		expect(res.status).toBe(200);
		expect(res.body.body.quests).toHaveLength(0);
		expect(res.body.body.goals).toHaveLength(0);
	});

	it("returns associated goals in the response", async () => {
		const chartId = await seedMinimalIidxSpChart();
		const goalId = `G_q_search_${Date.now()}`;
		const suffix = `${Date.now()}-g`;

		await DB.insertInto("goal")
			.values({
				id: goalId,
				game: "iidx-sp",
				name: "Search goal",
				charts: JSON.stringify({ type: "single", data: chartId }),
				criteria: JSON.stringify({ mode: "single", key: "lamp", value: 4 }),
			})
			.execute();

		const questId = await seedQuest(suffix, goalId);

		const res = await mockApi.get(
			`/api/v1/games/iidx-sp/targets/quests?search=Quest+${suffix}`,
		);

		expect(res.status).toBe(200);

		const questIds = (res.body.body.quests as Array<{ questID: string }>).map((q) => q.questID);
		const goalIds = (res.body.body.goals as Array<{ goalID: string }>).map((g) => g.goalID);

		expect(questIds).toContain(questId);
		expect(goalIds).toContain(goalId);
	});
});

describe("GET /api/v1/games/:game/targets/quests/:questID", () => {
	it("returns quest + subscribers + goals + parentQuestlines", async () => {
		const suffix = `${Date.now()}-d`;
		const questId = await seedQuest(suffix);

		const res = await mockApi.get(`/api/v1/games/iidx-sp/targets/quests/${questId}`);

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.body.quest.questID).toBe(questId);
		expect(Array.isArray(res.body.body.questSubs)).toBe(true);
		expect(Array.isArray(res.body.body.users)).toBe(true);
		expect(Array.isArray(res.body.body.goals)).toBe(true);
		expect(Array.isArray(res.body.body.parentQuestlines)).toBe(true);
	});

	it("returns 404 when quest does not exist", async () => {
		const res = await mockApi.get("/api/v1/games/iidx-sp/targets/quests/q_no_such_quest");

		expect(res.status).toBe(404);
		expect(res.body.success).toBe(false);
	});

	it("returns 404 when quest belongs to a different game", async () => {
		const suffix = `${Date.now()}-x`;
		const questId = await seedQuest(suffix);

		const res = await mockApi.get(`/api/v1/games/sdvx/targets/quests/${questId}`);

		expect(res.status).toBe(404);
	});

	it("parentQuestlines entries have V3Game shape (not legacy gameGroup+playtype)", async () => {
		const suffix = `${Date.now()}-v3`;
		const qlId = `ql-v3-${suffix}`;
		const questId = await seedQuest(suffix);

		await DB.insertInto("questline")
			.values({
				id: qlId,
				game: "iidx-sp",
				name: "V3 test questline",
				description: "d",
			})
			.execute();

		await DB.insertInto("questline_quest")
			.values({
				questline_id: qlId,
				quest_id: questId,
				sort_order: 0,
			})
			.execute();

		const res = await mockApi.get(`/api/v1/games/iidx-sp/targets/quests/${questId}`);

		expect(res.status).toBe(200);

		const ql = (
			res.body.body.parentQuestlines as Array<{
				game: string;
				questlineID: string;
				quests: string[];
			}>
		).find((x) => x.questlineID === qlId);

		expect(ql).toBeDefined();
		// game should be the V3Game string, not a legacy GameGroup
		expect(ql?.game).toBe("iidx-sp");
		// must NOT have a top-level playtype field
		expect((ql as any)?.playtype).toBeUndefined();
		// must carry the quests array
		expect(Array.isArray(ql?.quests)).toBe(true);
		expect(ql?.quests).toContain(questId);
	});
});
