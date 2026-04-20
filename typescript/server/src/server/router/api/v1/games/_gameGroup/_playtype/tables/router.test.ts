import DB from "#services/pg/db";
import mockApi, { CloseServerConnection } from "#test-utils/mock-api";
import { TestingIIDXFolderSP10 } from "#test-utils/test-data";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

afterAll(() => CloseServerConnection());

describe("GET /api/v1/games/:game/tables", () => {
	beforeEach(async () => {
		const folderId = "tfolder";
		const tableId = `tbl_${Date.now()}`;

		await DB.insertInto("folder")
			.values({
				id: folderId,
				legacy_id: "testing_folder",
				game: "iidx-sp",
				inactive: false,
				title: TestingIIDXFolderSP10.title,
				slug: folderId,
				where: "chart.level_num = 10",
				version_filter: null,
				search_terms: [],
			})
			.execute();

		await DB.insertInto("table")
			.values({
				id: tableId,
				legacy_id: "mock_table",
				game: "iidx-sp",
				inactive: false,
				title: "Mock Table",
				default_value: false,
				slug: "mock_table",
			})
			.execute();

		await DB.insertInto("table_folder")
			.values({
				table_id: tableId,
				folder_id: folderId,
				ordering: 0,
			})
			.execute();
	});

	it("returns all tables for this game", async () => {
		const res = await mockApi.get("/api/v1/games/iidx-sp/tables");

		expect(res.status).toBe(200);
		expect(res.body.body.length).toBe(1);
		expect(res.body.body[0].tableID).toBe("mock_table");
	});
});

describe("GET /api/v1/games/:game/tables/:tableID", () => {
	beforeEach(async () => {
		const folderId = "tfolder2";
		const tableId = `tbl2_${Date.now()}`;

		await DB.insertInto("folder")
			.values({
				id: folderId,
				legacy_id: "testing_folder",
				game: "iidx-sp",
				inactive: false,
				title: "t",
				slug: folderId,
				where: "chart.level_num = 10",
				version_filter: null,
				search_terms: [],
			})
			.execute();

		await DB.insertInto("table")
			.values({
				id: tableId,
				legacy_id: "mock_table",
				game: "iidx-sp",
				inactive: false,
				title: "Mock Table",
				default_value: false,
				slug: "mock_table",
			})
			.execute();

		await DB.insertInto("table_folder")
			.values({
				table_id: tableId,
				folder_id: folderId,
				ordering: 0,
			})
			.execute();
	});

	it("returns the table and its folder slots", async () => {
		const res = await mockApi.get("/api/v1/games/iidx-sp/tables/mock_table");

		expect(res.status).toBe(200);
		expect(res.body.body.table.tableID).toBe("mock_table");
		expect(res.body.body.folders.length).toBe(1);
	});

	it("returns 404 when the table does not exist", async () => {
		const res = await mockApi.get("/api/v1/games/iidx-sp/tables/non_existent_table");

		expect(res.status).toBe(404);
	});
});
