import DB from "#services/pg/db";
import mockApi, { CloseServerConnection } from "#test-utils/mock-api";
import { afterAll, describe, expect, it } from "vitest";

afterAll(() => CloseServerConnection());

let seedCounter = 0;

async function seedBmsSongAndChart(opts: {
	game: "bms-7k" | "bms-14k";
	sglEC: number | null;
	sglHC: number | null;
}) {
	const n = ++seedCounter;
	const songPgId = `s_gpt_bms_${n}`;
	const chartPgId = `c_gpt_bms_${n}`;

	await DB.insertInto("song")
		.values({
			id: songPgId,
			legacy_id: 970_000 + n,
			game_group: "bms",
			title: `Sieglinde GPT Test ${n}`,
			artist: "Test",
			search_terms: [],
			alt_titles: [],
			fts_document: "",
			data: {
				subtitle: null,
				subartist: null,
				genre: null,
				tableString: null,
			},
		})
		.execute();

	const md5 = n.toString(16).padStart(32, "0");
	const sha256 = (n + 4096).toString(16).padStart(64, "0");

	await DB.insertInto("chart")
		.values({
			id: chartPgId,
			legacy_id: chartPgId,
			game: opts.game,
			song_id: songPgId,
			level: "?",
			level_num: 0,
			is_primary: true,
			difficulty: "CHART",
			versions: [],
			data: {
				hashMD5: md5,
				hashSHA256: sha256,
				notecount: 1,
				tableFolders: {},
				aiLevel: null,
				sglEC: opts.sglEC,
				sglHC: opts.sglHC,
			},
		})
		.execute();

	return { chartPgId, songLegacyId: 970_000 + n };
}

describe("GET /api/v1/games/bms/:playtype/sieglinde-charts", () => {
	it("returns empty songs and charts when nothing matches", async () => {
		const res = await mockApi.get("/api/v1/games/bms/7K/sieglinde-charts");

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.body.charts).toEqual([]);
		expect(res.body.body.songs).toEqual([]);
	});

	it("returns 400 for an invalid playtype", async () => {
		const res = await mockApi.get("/api/v1/games/bms/99K/sieglinde-charts");

		expect(res.status).toBe(400);
		expect(res.body.success).toBe(false);
		expect(String(res.body.description)).toContain("playtype");
	});

	it("includes charts with sglEC > 0 and their songs", async () => {
		const { chartPgId, songLegacyId } = await seedBmsSongAndChart({
			game: "bms-7k",
			sglEC: 12,
			sglHC: null,
		});

		const res = await mockApi.get("/api/v1/games/bms/7K/sieglinde-charts");

		expect(res.status).toBe(200);
		expect(res.body.body.charts).toHaveLength(1);
		expect(res.body.body.charts[0].chartID).toBe(chartPgId);
		expect(res.body.body.charts[0].songID).toBe(songLegacyId);
		expect(res.body.body.charts[0].data.sglEC).toBe(12);

		expect(res.body.body.songs).toHaveLength(1);
		expect(res.body.body.songs[0].id).toBe(songLegacyId);
		expect(res.body.body.songs[0].title).toContain("Sieglinde GPT Test");
	});

	it("includes charts with sglHC > 0", async () => {
		await seedBmsSongAndChart({
			game: "bms-7k",
			sglEC: null,
			sglHC: 9,
		});

		const res = await mockApi.get("/api/v1/games/bms/7K/sieglinde-charts");

		expect(res.status).toBe(200);
		const withHc = res.body.body.charts.filter((c: { data: { sglHC: number | null } }) =>
			Boolean(c.data.sglHC),
		);
		expect(withHc.length).toBeGreaterThanOrEqual(1);
		expect(withHc.some((c: { data: { sglHC: number | null } }) => c.data.sglHC === 9)).toBe(
			true,
		);
	});

	it("excludes charts with only zero or null sieglinde fields", async () => {
		const positive = await seedBmsSongAndChart({
			game: "bms-7k",
			sglEC: 3,
			sglHC: null,
		});
		await seedBmsSongAndChart({
			game: "bms-7k",
			sglEC: 0,
			sglHC: null,
		});
		await seedBmsSongAndChart({
			game: "bms-7k",
			sglEC: null,
			sglHC: null,
		});

		const res = await mockApi.get("/api/v1/games/bms/7K/sieglinde-charts");

		expect(res.status).toBe(200);
		expect(res.body.body.charts).toHaveLength(1);
		expect(res.body.body.charts[0].chartID).toBe(positive.chartPgId);
	});

	it("scopes results to the requested BMS playtype", async () => {
		await seedBmsSongAndChart({
			game: "bms-14k",
			sglEC: 99,
			sglHC: null,
		});

		const res7 = await mockApi.get("/api/v1/games/bms/7K/sieglinde-charts");
		const res14 = await mockApi.get("/api/v1/games/bms/14K/sieglinde-charts");

		expect(res7.status).toBe(200);
		expect(res14.status).toBe(200);

		expect(
			res7.body.body.charts.some((c: { data: { sglEC: number } }) => c.data.sglEC === 99),
		).toBe(false);
		expect(
			res14.body.body.charts.some((c: { data: { sglEC: number } }) => c.data.sglEC === 99),
		).toBe(true);
	});
});

describe("GET /api/v1/games/bms/:playtype/custom-tables", () => {
	it("lists public custom tables for the playtype", async () => {
		const res = await mockApi.get("/api/v1/games/bms/7K/custom-tables");

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(Array.isArray(res.body.body)).toBe(true);
		const urlNames = res.body.body.map((t: { urlName: string }) => t.urlName);
		expect(urlNames).toContain("sieglindeEC");
		expect(urlNames).toContain("sieglindeHC");
	});
});
