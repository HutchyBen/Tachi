import { seedApiToken } from "#actions/test-utils/api-tokens";
import { mongoScoreDataToPg } from "#lib/v3/migration-tools";
import DB from "#services/pg/db";
import mockApi, { CloseServerConnection } from "#test-utils/mock-api";
import { seedUser } from "#test-utils/pg-fixtures";
import { type MONGO_ScoreData } from "tachi-common";
import { afterAll, describe, expect, it } from "vitest";

afterAll(() => CloseServerConnection());

const SONG_PG = "S_SESS_ROUTER_TEST";
const CHART_PG = "C_SESS_ROUTER_TEST";
const CHART_LEGACY = "c_sess_router_test_legacy_001";
const SONG_LEGACY = 50_001;

async function seedSessionFixture() {
	const { id: userId } = await seedUser({ username: "session_router_user" });

	const sessionId = `Q${"d".repeat(40)}`;
	const scoreId = "score-sess-router-test";
	const now = new Date().toISOString();

	await DB.insertInto("song")
		.values({
			id: SONG_PG,
			legacy_id: SONG_LEGACY,
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
			id: CHART_PG,
			legacy_id: CHART_LEGACY,
			game: "iidx-sp",
			song_id: SONG_PG,
			difficulty: "ANOTHER",
			level: "10",
			level_num: 10,
			is_primary: true,
			versions: ["27"],
			data: { inGameID: 1000, notecount: 786 },
		})
		.execute();

	const { data, derived, judgements } = mongoScoreDataToPg("iidx:SP", {
		grade: "AAA",
		lamp: "EX HARD CLEAR",
		percent: 90,
		score: 1400,
		optional: {},
		judgements: {},
	} as MONGO_ScoreData<"iidx:SP">);

	await DB.insertInto("session")
		.values({
			id: sessionId,
			user_id: userId,
			game: "iidx-sp",
			name: "Seed Session",
			description: null,
			time_inserted: now,
			time_started: now,
			time_ended: now,
			calculated_data: JSON.stringify({}),
			highlight: false,
		})
		.execute();

	await DB.insertInto("score")
		.values({
			id: scoreId,
			user_id: userId,
			chart_id: CHART_PG,
			game: "iidx-sp",
			session_id: sessionId,
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

	return { userId, sessionId, scoreId };
}

describe("GET /api/v1/sessions/:sessionID", () => {
	it("returns 404 when the session does not exist", async () => {
		const res = await mockApi.get("/api/v1/sessions/nonexistent_session_id_xxxxxxxx");

		expect(res.status).toBe(404);
		expect(res.body.success).toBe(false);
	});

	it("returns session, scores, songs, charts, user, and scoreInfo", async () => {
		const { sessionId, scoreId, userId } = await seedSessionFixture();

		const res = await mockApi.get(`/api/v1/sessions/${sessionId}`);

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.body.session.sessionID).toBe(sessionId);
		expect(res.body.body.scores).toHaveLength(1);
		expect(res.body.body.scores[0].scoreID).toBe(scoreId);
		expect(res.body.body.charts).toHaveLength(1);
		expect(res.body.body.charts[0].chartID).toBe(CHART_PG);
		expect(res.body.body.songs).toHaveLength(1);
		expect(res.body.body.songs[0].id).toBe(SONG_LEGACY);
		expect(res.body.body.user.id).toBe(userId);
		expect(Array.isArray(res.body.body.scoreInfo)).toBe(true);
	});
});

describe("PATCH /api/v1/sessions/:sessionID", () => {
	it("updates the session name when authorised", async () => {
		const { sessionId, userId } = await seedSessionFixture();

		await seedApiToken({
			token: "sess_patch_token",
			userId,
			customiseSession: true,
		});

		const res = await mockApi
			.patch(`/api/v1/sessions/${sessionId}`)
			.set("Authorization", "Bearer sess_patch_token")
			.send({ name: "patched_name" });

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.body).toEqual({});

		const row = await DB.selectFrom("session")
			.select("name")
			.where("id", "=", sessionId)
			.executeTakeFirst();

		expect(row?.name).toBe("patched_name");
	});

	it("returns 400 for an empty PATCH body", async () => {
		const { sessionId, userId } = await seedSessionFixture();

		await seedApiToken({
			token: "sess_patch_token",
			userId,
			customiseSession: true,
		});

		const res = await mockApi
			.patch(`/api/v1/sessions/${sessionId}`)
			.set("Authorization", "Bearer sess_patch_token")
			.send({});

		expect(res.status).toBe(400);
	});
});
