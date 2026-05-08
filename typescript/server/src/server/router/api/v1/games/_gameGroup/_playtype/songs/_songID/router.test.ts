import DB from "#services/pg/db";
import mockApi, { CloseServerConnection } from "#test-utils/mock-api";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

afterAll(() => CloseServerConnection());

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SONG_PG_ID = "S_TEST_IIDX_SONG_001";
const CHART_PG_ID = "C_TEST_IIDX_CHART_001";
const CHART_PG_ID_2 = "C_TEST_IIDX_CHART_002";
const SONG_LEGACY_ID = 1;
const CHART_LEGACY_ID = "c2311194e3897ddb5745b1760d2c0141f933e683";
const CHART_LEGACY_ID_2 = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

async function seedSong({
	pgId = SONG_PG_ID,
	legacyId = SONG_LEGACY_ID,
	title = "5.1.1.",
	artist = "dj nagureo",
	searchTerms = [] as string[],
	altTitles = [] as string[],
} = {}) {
	await DB.insertInto("song")
		.values({
			id: pgId,
			legacy_id: legacyId,
			game_group: "iidx",
			title,
			artist,
			search_terms: searchTerms,
			alt_titles: altTitles,
			data: { displayVersion: "1", genre: "PIANO AMBIENT" },
			fts_document: [...searchTerms, ...altTitles].filter(Boolean).join(" "),
		})
		.execute();
}

async function seedChart({
	pgId = CHART_PG_ID,
	legacyId = CHART_LEGACY_ID,
	songNewID = SONG_PG_ID,
	difficulty = "ANOTHER",
	level = "10",
	levelNum = 10,
	isPrimary = true,
	versions = ["27", "26"] as string[],
} = {}) {
	await DB.insertInto("chart")
		.values({
			id: pgId,
			legacy_id: legacyId,
			game: "iidx-sp",
			song_id: songNewID,
			difficulty,
			level,
			level_num: levelNum,
			is_primary: isPrimary,
			versions,
			data: { inGameID: 1000, notecount: 786 },
		})
		.execute();
}

// ─── GET /api/v1/games/iidx-sp/songs/:songID ─────────────────────────────────

describe("GET /api/v1/games/iidx-sp/songs/:songID", () => {
	beforeEach(async () => {
		await seedSong();
		await seedChart();
	});

	it("returns 200 with the song and its charts", async () => {
		const res = await mockApi.get(`/api/v1/games/iidx-sp/songs/${SONG_PG_ID}`);

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.body.song.title).toBe("5.1.1.");
		expect(res.body.body.song.id).toBe(SONG_PG_ID);
		expect(res.body.body.charts).toHaveLength(1);
	});

	it("returns the correct chart fields", async () => {
		const res = await mockApi.get(`/api/v1/games/iidx-sp/songs/${SONG_PG_ID}`);

		const [chart] = res.body.body.charts;

		expect(chart.chartID).toBe(CHART_PG_ID);
		expect(chart.song.id).toBe(SONG_PG_ID);
		expect(chart.difficulty).toBe("ANOTHER");
		expect(chart.level).toBe("10");
		expect(chart.levelNum).toBe(10);
		expect(chart.isPrimary).toBe(true);
		expect(chart.game).toBe("iidx-sp");
	});

	it("includes chart versions", async () => {
		const res = await mockApi.get(`/api/v1/games/iidx-sp/songs/${SONG_PG_ID}`);

		const [chart] = res.body.body.charts;

		expect(chart.versions).toEqual(expect.arrayContaining(["27", "26"]));
	});

	it("includes song searchTerms and altTitles", async () => {
		const OTHER_PG_ID = "S_TEST_IIDX_SONG_002";
		const OTHER_LEGACY_ID = 2;

		await seedSong({
			pgId: OTHER_PG_ID,
			legacyId: OTHER_LEGACY_ID,
			title: "GRADIUSIC CYBER",
			searchTerms: ["511"],
			altTitles: ["Five One One"],
		});

		const res = await mockApi.get(`/api/v1/games/iidx-sp/songs/${OTHER_PG_ID}`);

		expect(res.status).toBe(200);
		expect(res.body.body.song.searchTerms).toContain("511");
		expect(res.body.body.song.altTitles).toContain("Five One One");
	});

	it("returns all charts for the song when there are multiple", async () => {
		await seedChart({
			pgId: CHART_PG_ID_2,
			legacyId: CHART_LEGACY_ID_2,
			difficulty: "HYPER",
			level: "8",
			levelNum: 8,
		});

		const res = await mockApi.get(`/api/v1/games/iidx-sp/songs/${SONG_PG_ID}`);

		expect(res.status).toBe(200);
		expect(res.body.body.charts).toHaveLength(2);

		const difficulties = res.body.body.charts.map((c: { difficulty: string }) => c.difficulty);

		expect(difficulties).toEqual(expect.arrayContaining(["ANOTHER", "HYPER"]));
	});

	it("only returns charts for the requested playtype", async () => {
		// Insert a DP chart for the same song - should not appear in the SP response.
		await DB.insertInto("chart")
			.values({
				id: "C_TEST_IIDX_DP_CHART",
				legacy_id: "dp_chart_legacy_id_0000000000000000000",
				game: "iidx-dp",
				song_id: SONG_PG_ID,
				difficulty: "ANOTHER",
				level: "10",
				level_num: 10,
				is_primary: true,
				versions: ["27", "26"],
				data: { inGameID: 1000, notecount: 786 },
			})
			.execute();

		const res = await mockApi.get(`/api/v1/games/iidx-sp/songs/${SONG_PG_ID}`);

		expect(res.status).toBe(200);
		expect(res.body.body.charts).toHaveLength(1);
		expect(res.body.body.charts[0].game).toBe("iidx-sp");
	});

	it("returns 404 when the song does not exist", async () => {
		const res = await mockApi.get(`/api/v1/games/iidx-sp/songs/99999`);

		expect(res.status).toBe(404);
		expect(res.body.success).toBe(false);
	});

	it("returns 404 when songID is not a known song id", async () => {
		const res = await mockApi.get(`/api/v1/games/iidx-sp/songs/not-a-number`);

		expect(res.status).toBe(404);
		expect(res.body.success).toBe(false);
	});

	it("returns 400 for an invalid game", async () => {
		const res = await mockApi.get(`/api/v1/games/not-a-real-game/songs/${SONG_PG_ID}`);

		expect(res.status).toBe(400);
		expect(res.body.success).toBe(false);
	});

	it("returns 400 for another invalid game slug", async () => {
		const res = await mockApi.get(`/api/v1/games/invalid-game-slug-zzz/songs/${SONG_PG_ID}`);

		expect(res.status).toBe(400);
		expect(res.body.success).toBe(false);
	});

	it("returns 0 charts when the song has no charts for this playtype", async () => {
		// Seed a separate song with no charts at all.
		const BARE_PG_ID = "S_TEST_IIDX_BARE_001";
		const BARE_LEGACY_ID = 99;

		await seedSong({ pgId: BARE_PG_ID, legacyId: BARE_LEGACY_ID, title: "Bare Song" });

		const res = await mockApi.get(`/api/v1/games/iidx-sp/songs/${BARE_PG_ID}`);

		expect(res.status).toBe(200);
		expect(res.body.body.song.title).toBe("Bare Song");
		expect(res.body.body.charts).toHaveLength(0);
	});
});
