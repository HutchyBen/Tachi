import DB from "#services/pg/db";
import mockApi, { CloseServerConnection } from "#test-utils/mock-api";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

afterAll(() => CloseServerConnection());

const SONG_PG_ID = "S_TEST_CHART_API_SONG_001";
const CHART_PG_ID = "C_TEST_CHART_API_CHART_001";
const SONG_LEGACY_ID = 60_001;
const CHART_LEGACY_ID = "c2311194e3897ddb5745b1760d2c0141f933e683";

async function seedSong() {
	await DB.insertInto("song")
		.values({
			id: SONG_PG_ID,
			legacy_id: SONG_LEGACY_ID,
			game_group: "iidx",
			title: "5.1.1.",
			artist: "dj nagureo",
			search_terms: [],
			alt_titles: [],
			data: { displayVersion: "1", genre: "PIANO AMBIENT" },
			fts_document: "",
		})
		.execute();
}

async function seedChart() {
	await DB.insertInto("chart")
		.values({
			id: CHART_PG_ID,
			legacy_id: CHART_LEGACY_ID,
			game: "iidx-sp",
			song_id: SONG_PG_ID,
			difficulty: "ANOTHER",
			level: "10",
			level_num: 10,
			is_primary: true,
			versions: ["27"],
			data: { inGameID: 1000, notecount: 786 },
		})
		.execute();
}

describe("GET /api/v1/games/iidx/SP/charts/:chartID", () => {
	beforeEach(async () => {
		await DB.deleteFrom("chart").where("id", "=", CHART_PG_ID).execute();
		await DB.deleteFrom("song").where("id", "=", SONG_PG_ID).execute();
		await seedSong();
		await seedChart();
	});

	it("returns 200 when chartID is the Postgres chart id", async () => {
		const res = await mockApi.get(`/api/v1/games/iidx/SP/charts/${CHART_PG_ID}`);

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.body.chart.chartID).toBe(CHART_PG_ID);
		expect(res.body.body.song.id).toBe(SONG_LEGACY_ID);
	});

	it("returns 404 when the chart does not exist", async () => {
		const res = await mockApi.get("/api/v1/games/iidx/SP/charts/nonexistent-chart-id");

		expect(res.status).toBe(404);
		expect(res.body.success).toBe(false);
	});
});
