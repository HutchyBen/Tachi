import DB from "#services/pg/db";
import mockApi, { CloseServerConnection } from "#test-utils/mock-api";
import { seedUser } from "#test-utils/pg-fixtures";
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

describe("POST /api/v1/import/orphans", () => {
	it("reprocesses the requesting user's orphan rows from Postgres", async () => {
		const { id: userId } = await seedUser({
			username: "import_orphan_user",
			withCredential: true,
			withSettings: true,
		});
		const cookie = await loginAs("import_orphan_user");

		await DB.insertInto("song")
			.values({
				id: "S_IMP_ORPHAN",
				legacy_id: 1,
				game_group: "iidx",
				title: "5.1.1.",
				artist: "dj nagureo",
				search_terms: [],
				alt_titles: [],
				data: { displayVersion: "1", genre: "PIANO AMBIENT" },
				fts_document: "",
			})
			.execute();

		await DB.insertInto("chart")
			.values({
				id: "C_IMP_ORPHAN",
				legacy_id: "c2311194e3897ddb5745b1760d2c0141f933e683",
				game: "iidx-sp",
				song_id: "S_IMP_ORPHAN",
				difficulty: "ANOTHER",
				level: "10",
				level_num: 10,
				is_primary: true,
				versions: ["27", "26"],
				data: {
					inGameID: 1000,
					notecount: 786,
					kaidenAverage: null,
					worldRecord: null,
				},
			})
			.execute();

		await DB.insertInto("orphan_score")
			.values({
				orphan_id: "asdf",
				user_id: userId,
				import_id: null,
				import_type: "ir/direct-manual",
				game_group: "iidx",
				context: {
					game: "iidx",
					playtype: "SP",
					service: "foo",
					version: "27",
				},
				data: {
					score: 500,
					lamp: "HARD CLEAR",
					matchType: "songTitle",
					identifier: "5.1.1.",
					difficulty: "ANOTHER",
				},
				time_inserted: new Date(1000).toISOString(),
				error_message: "foo",
			})
			.execute();

		await DB.insertInto("orphan_score")
			.values({
				orphan_id: "asdf2",
				user_id: userId,
				import_id: null,
				import_type: "ir/direct-manual",
				game_group: "iidx",
				context: {
					game: "iidx",
					playtype: "SP",
					service: "foo",
					version: "27",
				},
				data: {
					score: 500,
					lamp: "HARD CLEAR",
					matchType: "songTitle",
					identifier: "TITLE NOBODY WILL USE",
					difficulty: "ANOTHER",
				},
				time_inserted: new Date(1000).toISOString(),
				error_message: "foo",
			})
			.execute();

		const res = await mockApi.post("/api/v1/import/orphans").set("Cookie", cookie);

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.body.success).toBe(1);
		expect(res.body.body.processed).toBe(2);
		expect(res.body.body.failed).toBe(1);

		const remaining = await DB.selectFrom("orphan_score")
			.select((eb) => eb.fn.countAll<number>().as("c"))
			.executeTakeFirstOrThrow();

		expect(Number(remaining.c)).toBe(1);
	});
});
