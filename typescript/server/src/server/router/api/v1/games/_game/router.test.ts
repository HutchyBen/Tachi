import mockApi from "#test-utils/mock-api";
import t from "tap";

import { GetGameGroupConfig } from "tachi-common";

t.test("GET /api/v1/games/:game", (t) => {
	t.test("Should parse the game from the header", async (t) => {
		const res = await mockApi.get("/api/v1/games/iidx");

		t.hasStrict(GetGameGroupConfig("iidx"), res.body.body);

		t.end();
	});

	t.test("Should reject an unsupported game.", async (t) => {
		const res = await mockApi.get("/api/v1/games/invalid_game");

		t.equal(res.statusCode, 400);

		t.end();
	});

	t.end();
});
