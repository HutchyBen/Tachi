import { mongoScoreDataToPg } from "#lib/v3/migration-tools";
import DB from "#services/pg/db";
import mockApi, { CloseServerConnection } from "#test-utils/mock-api";
import { seedUser } from "#test-utils/pg-fixtures";
import { TestingIIDXFolderSP10, TestingIIDXSPScorePB } from "#test-utils/test-data";
import { type ScoreData } from "tachi-common";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

afterAll(() => CloseServerConnection());

describe("GET /api/v1/users/:userID/games/:game/tables/:tableID", () => {
	beforeEach(async () => {
		await seedUser({ username: "tbl_user" });

		const songId = "tsong1";
		const chartId = TestingIIDXSPScorePB.chartID;

		await DB.insertInto("song")
			.values({
				id: songId,
				legacy_id: 1,
				game_group: "iidx",
				title: "S",
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

		const folderId = "ugtfolder";
		await DB.insertInto("folder")
			.values({
				id: folderId,
				legacy_id: "testing_folder",
				game: "iidx-sp",
				inactive: false,
				title: TestingIIDXFolderSP10.title,
				slug: folderId,
				where: `chart.id = '${chartId}'`,
				version_filter: null,
				search_terms: [],
			})
			.execute();

		const tableUuid = `tblu_${Date.now()}`;
		await DB.insertInto("table")
			.values({
				id: tableUuid,
				legacy_id: "mock_table",
				game: "iidx-sp",
				inactive: false,
				title: "T",
				default_value: false,
				slug: "mock_table",
			})
			.execute();

		await DB.insertInto("table_folder")
			.values({ table_id: tableUuid, folder_id: folderId, ordering: 0 })
			.execute();

		await DB.insertInto("game_profile")
			.values({
				user_id: 1,
				game: "iidx-sp",
				ratings: JSON.stringify({}),
				classes: JSON.stringify({}),
			})
			.execute();

		const sd = TestingIIDXSPScorePB.scoreData as ScoreData<"iidx-sp">;
		const { data, derived, judgements } = mongoScoreDataToPg("iidx-sp", sd);
		const now = new Date().toISOString();

		await DB.insertInto("pb")
			.values({
				user_id: 1,
				chart_id: chartId,
				lens: null,
				data: JSON.stringify(data),
				derived_data: JSON.stringify(derived),
				calculated_data: JSON.stringify(TestingIIDXSPScorePB.calculatedData),
				judgements: JSON.stringify(judgements),
				ranking_value: 100,
				ranking_value_tb1: null,
				ranking_value_tb2: null,
				ranking_value_tb3: null,
				ranking_value_tb4: null,
				ranking_value_tb5: null,
				highlight: false,
				time_achieved: now,
			})
			.execute();
	});

	it("returns stats for a table the user has played", async () => {
		const res = await mockApi.get("/api/v1/users/1/games/iidx-sp/tables/mock_table");

		expect(res.status).toBe(200);
		expect(res.body.body.table.tableID).toBe("mock_table");
		expect(res.body.body.folders.length).toBe(1);
		expect(res.body.body.stats.length).toBeGreaterThanOrEqual(1);
	});

	it("returns 404 when the table does not exist", async () => {
		const res = await mockApi.get("/api/v1/users/1/games/iidx-sp/tables/bad_table");

		expect(res.status).toBe(404);
	});
});
