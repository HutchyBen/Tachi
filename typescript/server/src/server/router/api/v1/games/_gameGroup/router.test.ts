import mockApi, { CloseServerConnection } from "#test-utils/mock-api";
import { GetGameGroupConfig } from "tachi-common";
import { afterAll, describe, expect, it } from "vitest";

afterAll(() => CloseServerConnection());

describe("GET /api/v1/games/:gameGroup", () => {
	it("returns the game group config from the route param", async () => {
		const res = await mockApi.get("/api/v1/games/iidx");

		expect(res.status).toBe(200);
		expect({
			...res.body.body,
			songData: null,
		}).toMatchObject({
			...GetGameGroupConfig("iidx"),
			songData: null,
		});
	});

	it("returns 400 for an unsupported game group", async () => {
		const res = await mockApi.get("/api/v1/games/invalid_game");

		expect(res.status).toBe(400);
	});
});
