import type { FolderDocument } from "tachi-common";

import MONGODB_KILL from "#services/mongo/db";
import mockApi from "#test-utils/mock-api";
import ResetDBState from "#test-utils/resets";
import { TestingIIDXFolderSP10, TestingIIDXSPScorePB } from "#test-utils/test-data";
import { CreateFolderChartLookup } from "#utils/folder";
import deepmerge from "deepmerge";
import t from "tap";

t.test("GET /api/v1/users/:userID/games/:game/:playtype/tables/:tableID", (t) => {
	t.beforeEach(ResetDBState);

	t.test("Should return a users statistics for this table", async (t) => {
		const folder = deepmerge(TestingIIDXFolderSP10, {
			folderID: "testing_folder",
		}) as FolderDocument;

		await MONGODB_KILL.folders.insert(folder);

		await CreateFolderChartLookup(folder, true);

		await MONGODB_KILL["personal-bests"].insert(TestingIIDXSPScorePB);

		const res = await mockApi.get("/api/v1/users/1/games/iidx/SP/tables/mock_table");

		t.equal(res.body.body.folders.length, 1);
		t.equal(res.body.body.folders[0].folderID, "testing_folder");
		t.equal(res.body.body.table.tableID, "mock_table");
		t.equal(res.body.body.stats.length, 1);

		t.equal(res.body.body.stats[0].stats.lamp["EX HARD CLEAR"], 1);
		t.equal(res.body.body.stats[0].stats.grade.AAA, 1);

		t.end();
	});

	t.test("Should return 404 if the table does not exist.", async (t) => {
		const res = await mockApi.get("/api/v1/users/1/games/iidx/SP/tables/bad_table");

		t.equal(res.statusCode, 404);

		t.end();
	});

	t.end();
});
