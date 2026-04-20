import DB from "#services/pg/db";
import mockApi, { CloseServerConnection } from "#test-utils/mock-api";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

afterAll(() => CloseServerConnection());

describe("GET /api/v1/games/:game/folders", () => {
	beforeEach(async () => {
		const id = "folder-foo";

		await DB.insertInto("folder")
			.values({
				id,
				legacy_id: "foo",
				game: "iidx-sp",
				inactive: false,
				title: "12",
				slug: id,
				where: "chart.level_num = 10",
				version_filter: null,
				search_terms: ["12"],
			})
			.execute();

		await DB.insertInto("folder")
			.values({
				id: "folder-bar",
				legacy_id: "bar",
				game: "iidx-dp",
				inactive: false,
				title: "12",
				slug: "folder-bar",
				where: "chart.level_num = 10",
				version_filter: null,
				search_terms: ["12"],
			})
			.execute();

		await DB.insertInto("folder")
			.values({
				id: "folder-baz",
				legacy_id: "baz",
				game: "bms-7k",
				inactive: false,
				title: "12",
				slug: "folder-baz",
				where: "chart.level_num = 10",
				version_filter: null,
				search_terms: ["12"],
			})
			.execute();
	});

	it("returns folders matching the search query for this GPT", async () => {
		const res = await mockApi.get("/api/v1/games/iidx-sp/folders?search=12");

		expect(res.status).toBe(200);
		expect(res.body.body.length).toBe(1);
		expect(res.body.body[0].folderID).toBe("folder-foo");
	});

	it("returns 400 when search is missing", async () => {
		const res = await mockApi.get("/api/v1/games/iidx-sp/folders");

		expect(res.status).toBe(400);
	});
});

describe("GET /api/v1/games/:game/folders/:folderSlug", () => {
	beforeEach(async () => {
		const songId = "fsong1";
		const chartId = "fchart1";

		await DB.insertInto("song")
			.values({
				id: songId,
				legacy_id: 1,
				game_group: "iidx",
				title: "T",
				artist: "A",
				search_terms: [],
				alt_titles: [],
				data: {},
				fts_document: "",
			})
			.execute();

		await DB.insertInto("chart")
			.values({
				id: chartId,
				legacy_id: chartId,
				game: "iidx-sp",
				song_id: songId,
				difficulty: "ANOTHER",
				level: "10",
				level_num: 10,
				is_primary: true,
				versions: [],
				data: {},
			})
			.execute();

		await DB.insertInto("folder")
			.values({
				id: "folder-foo2",
				legacy_id: "foo",
				game: "iidx-sp",
				inactive: false,
				title: "12",
				slug: "foo",
				where: `chart.id = '${chartId}'`,
				version_filter: null,
				search_terms: [],
			})
			.execute();

		await DB.insertInto("folder_chart_lookup")
			.values({ folder_id: "folder-foo2", chart_id: chartId })
			.execute();
	});

	it("returns the folder and matching charts/songs", async () => {
		const res = await mockApi.get("/api/v1/games/iidx-sp/folders/foo");

		expect(res.status).toBe(200);
		expect(res.body.body.folder.folderID).toBe("folder-foo2");
		expect(res.body.body.charts.length).toBeGreaterThanOrEqual(1);
	});

	it("returns 404 when the folder does not exist", async () => {
		const res = await mockApi.get("/api/v1/games/iidx-sp/folders/bar");

		expect(res.status).toBe(404);
	});
});
