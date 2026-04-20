import { mongoScoreDataToPg } from "#lib/v3/migration-tools";
import DB from "#services/pg/db";
import mockApi, { CloseServerConnection } from "#test-utils/mock-api";
import { seedUser } from "#test-utils/pg-fixtures";
import { Testing511Song, Testing511SPA, TestingIIDXSPScore } from "#test-utils/test-data";
import { type ScoreData } from "tachi-common";
import { afterAll, describe, expect, it } from "vitest";

afterAll(() => CloseServerConnection());

async function loginAs(username: string, password = "password123") {
	const res = await mockApi.post("/api/v1/auth/login").send({
		username,
		"!password": password,
		captcha: "test",
	});

	return res.headers["set-cookie"] as unknown as string[];
}

describe("POST /api/v1/admin/delete-score", () => {
	it("returns 403 when the caller is not an admin", async () => {
		await seedUser({
			username: "pleb",
			email: "pleb@test.com",
			withCredential: true,
			withSettings: true,
		});

		const plebCookie = await loginAs("pleb");

		const res = await mockApi
			.post("/api/v1/admin/delete-score")
			.set("Cookie", plebCookie)
			.send({ scoreID: "anything" });

		expect(res.status).toBe(403);
	});

	it("deletes another user's score when the caller is an admin", async () => {
		await seedUser({
			username: "admin_del",
			email: "admin_del@test.com",
			authLevel: "admin",
			withCredential: true,
			withSettings: true,
		});
		await seedUser({
			username: "victim",
			email: "victim_adm@test.com",
			withCredential: true,
			withSettings: true,
		});

		const adminCookie = await loginAs("admin_del");

		const chartId = Testing511SPA.chartID;
		const sd = TestingIIDXSPScore.scoreData as ScoreData<"iidx-sp">;
		const { data, derived, judgements } = mongoScoreDataToPg("iidx-sp", sd);
		const now = new Date().toISOString();

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
				id: chartId,
				legacy_id: chartId,
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

		await DB.insertInto("score")
			.values({
				id: "deleteme",
				user_id: 2,
				chart_id: chartId,
				game: "iidx-sp",
				session_id: null,
				import_id: null,
				data: JSON.stringify(data),
				derived_data: JSON.stringify(derived),
				judgements: JSON.stringify(judgements),
				calculated_data: JSON.stringify({}),
				meta: JSON.stringify({}),
				time_achieved: now,
				time_added: now,
				highlight: false,
				comment: null,
			})
			.execute();

		const res = await mockApi
			.post("/api/v1/admin/delete-score")
			.set("Cookie", adminCookie)
			.send({ scoreID: "deleteme" });

		expect(res.status).toBe(200);

		const row = await DB.selectFrom("score")
			.select("id")
			.where("id", "=", "deleteme")
			.executeTakeFirst();

		expect(row).toBeUndefined();
	});
});

describe("POST /api/v1/admin/change-log-level", () => {
	it.todo("no route in router.ts (see router.oldtest.ts)");
});
