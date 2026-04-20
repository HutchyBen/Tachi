import DB from "#services/pg/db";
import mockApi, { CloseServerConnection } from "#test-utils/mock-api";
import { Testing511Song, Testing511SPA } from "#test-utils/test-data";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

afterAll(() => CloseServerConnection());

async function seed511Chart() {
	await DB.insertInto("song")
		.values({
			id: Testing511Song.id,
			legacy_id: 1,
			game_group: "iidx",
			title: Testing511Song.title,
			artist: Testing511Song.artist,
			search_terms: [],
			alt_titles: [],
			data: Testing511Song.data,
			fts_document: "",
		})
		.execute();

	await DB.insertInto("chart")
		.values({
			id: Testing511SPA.chartID,
			legacy_id: Testing511SPA.chartID,
			game: "iidx-sp",
			song_id: Testing511Song.id,
			difficulty: Testing511SPA.difficulty,
			level: Testing511SPA.level,
			level_num: Testing511SPA.levelNum,
			is_primary: true,
			versions: Testing511SPA.versions,
			data: Testing511SPA.data,
		})
		.execute();
}

describe("POST /api/v1/games/:game/charts/resolve", () => {
	beforeEach(seed511Chart);

	it("resolves a chart using tachiSongID matchType", async () => {
		const res = await mockApi.post("/api/v1/games/iidx-sp/charts/resolve").send({
			matchType: "tachiSongID",
			identifier: Testing511Song.id,
			difficulty: "ANOTHER",
		});

		expect(res.status).toBe(200);
		expect(res.body.body.chart.chartID).toBe(Testing511SPA.chartID);
		expect(res.body.body.song.title).toBe("5.1.1.");
	});

	it("resolves a chart using songTitle matchType", async () => {
		const res = await mockApi.post("/api/v1/games/iidx-sp/charts/resolve").send({
			matchType: "songTitle",
			identifier: "5.1.1.",
			difficulty: "ANOTHER",
		});

		expect(res.status).toBe(200);
		expect(res.body.body.chart.chartID).toBe(Testing511SPA.chartID);
	});

	it("returns 404 when the chart cannot be resolved", async () => {
		const res = await mockApi.post("/api/v1/games/iidx-sp/charts/resolve").send({
			matchType: "tachiSongID",
			identifier: "99999",
			difficulty: "ANOTHER",
		});

		expect(res.status).toBe(404);
	});

	it("returns 400 for an invalid matchType", async () => {
		const res = await mockApi.post("/api/v1/games/iidx-sp/charts/resolve").send({
			matchType: "invalidMatchType",
			identifier: "1",
		});

		expect(res.status).toBe(400);
	});

	it("returns 400 when required fields are missing", async () => {
		const res = await mockApi.post("/api/v1/games/iidx-sp/charts/resolve").send({
			matchType: "tachiSongID",
		});

		expect(res.status).toBe(400);
	});
});

describe("GET /api/v1/games/:game/charts (popular & search)", () => {
	it.todo("requires large IIDX chart/PB corpus — port from router.oldtest.ts");
});
