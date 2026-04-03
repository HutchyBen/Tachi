import DB from "#services/pg/db";
import mockApi, { CloseServerConnection } from "#test-utils/mock-api";
import { afterAll, describe, expect, it } from "vitest";

afterAll(() => CloseServerConnection());

describe("GET /api/v1/games/:game/:playtype/targets/questlines", () => {
	it("returns questlines and standalone quests for the GPT", async () => {
		const suffix = `${Date.now()}`;
		const qlId = `ql-rt-${suffix}`;
		const qIn = `q-in-${suffix}`;
		const qStandalone = `q-standalone-${suffix}`;

		await DB.insertInto("quest")
			.values([
				{
					id: qIn,
					game: "iidx-sp",
					name: "In line",
					description: "d",
					quest_data: JSON.stringify([]),
				},
				{
					id: qStandalone,
					game: "iidx-sp",
					name: "Standalone",
					description: "d",
					quest_data: JSON.stringify([]),
				},
			])
			.execute();

		await DB.insertInto("questline")
			.values({
				id: qlId,
				game: "iidx-sp",
				name: "Test line",
				description: "desc",
			})
			.execute();

		await DB.insertInto("questline_quest")
			.values({
				questline_id: qlId,
				quest_id: qIn,
				sort_order: 0,
			})
			.execute();

		const res = await mockApi.get("/api/v1/games/iidx/SP/targets/questlines");

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);

		const ids = (res.body.body.questlines as Array<{ questlineID: string }>).map(
			(q) => q.questlineID,
		);

		expect(ids).toContain(qlId);

		const ql = (
			res.body.body.questlines as Array<{ questlineID: string; quests: Array<string> }>
		).find((x) => x.questlineID === qlId);

		expect(ql?.quests).toEqual([qIn]);

		const standaloneIds = (res.body.body.standalone as Array<{ questID: string }>).map(
			(q) => q.questID,
		);

		expect(standaloneIds).toContain(qStandalone);
	});

	it("returns 404 when the questline is missing", async () => {
		const res = await mockApi.get(
			"/api/v1/games/iidx/SP/targets/questlines/no_such_questline_zzz",
		);

		expect(res.status).toBe(404);
		expect(res.body.success).toBe(false);
	});

	it("returns a questline with ordered child quests", async () => {
		const suffix = `${Date.now()}-b`;
		const qlId = `ql-ord-${suffix}`;
		const qa = `q-a-${suffix}`;
		const qb = `q-b-${suffix}`;

		await DB.insertInto("quest")
			.values([
				{
					id: qa,
					game: "iidx-sp",
					name: "A",
					description: "d",
					quest_data: JSON.stringify([]),
				},
				{
					id: qb,
					game: "iidx-sp",
					name: "B",
					description: "d",
					quest_data: JSON.stringify([]),
				},
			])
			.execute();

		await DB.insertInto("questline")
			.values({
				id: qlId,
				game: "iidx-sp",
				name: "Ordered",
				description: "d",
			})
			.execute();

		await DB.insertInto("questline_quest")
			.values([
				{ questline_id: qlId, quest_id: qb, sort_order: 0 },
				{ questline_id: qlId, quest_id: qa, sort_order: 1 },
			])
			.execute();

		const res = await mockApi.get(`/api/v1/games/iidx/SP/targets/questlines/${qlId}`);

		expect(res.status).toBe(200);
		expect(res.body.body.questline.questlineID).toBe(qlId);

		const order = (res.body.body.quests as Array<{ questID: string }>).map((q) => q.questID);

		expect(order).toEqual([qb, qa]);
	});
});
