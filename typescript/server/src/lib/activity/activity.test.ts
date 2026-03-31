import { GetRecentActivity } from "#lib/activity/activity";
import DB from "#services/pg/db";
import mockApi, { CloseServerConnection } from "#test-utils/mock-api";
import { seedUser } from "#test-utils/pg-fixtures";
import { UnixMillisecondsToISO8601 } from "#utils/time";
import { afterAll, describe, expect, it } from "vitest";

afterAll(() => CloseServerConnection());

describe("GetRecentActivity (Postgres)", () => {
	let counter = 0;

	async function insertIidxSession(opts: {
		id: string;
		timeEndedMs: number;
		timeStartedMs: number;
		userId: number;
	}) {
		const isoStart = UnixMillisecondsToISO8601(opts.timeStartedMs);
		const isoEnd = UnixMillisecondsToISO8601(opts.timeEndedMs);

		await DB.insertInto("session")
			.values({
				id: opts.id,
				user_id: opts.userId,
				game: "iidx-sp",
				name: "s",
				description: null,
				time_inserted: isoEnd,
				time_started: isoStart,
				time_ended: isoEnd,
				calculated_data: JSON.stringify({}),
				highlight: false,
			})
			.execute();
	}

	async function seedIidxScore(opts: {
		chartId: string;
		highlight: boolean;
		scoreId: string;
		songId: string;
		timeAchievedMs: number | null;
		timeAddedMs: number;
		userId: number;
	}) {
		const n = ++counter;

		await DB.insertInto("song")
			.values({
				id: opts.songId,
				legacy_id: 7_000_000 + n,
				game_group: "iidx",
				title: "T",
				artist: "A",
				search_terms: [],
				alt_titles: [],
				data: JSON.stringify({}),
				fts_document: "",
			})
			.execute();

		await DB.insertInto("chart")
			.values({
				id: opts.chartId,
				legacy_id: opts.chartId,
				game: "iidx-sp",
				song_id: opts.songId,
				level: "10",
				level_num: 10,
				is_primary: true,
				difficulty: "NORMAL",
				versions: [],
				data: JSON.stringify({}),
			})
			.execute();

		await DB.insertInto("score")
			.values({
				id: opts.scoreId,
				user_id: opts.userId,
				chart_id: opts.chartId,
				game: "iidx-sp",
				session_id: null,
				import_id: null,
				data: JSON.stringify({}),
				derived_data: JSON.stringify({}),
				judgements: JSON.stringify({}),
				calculated_data: JSON.stringify({}),
				meta: JSON.stringify({}),
				time_achieved:
					opts.timeAchievedMs === null
						? null
						: UnixMillisecondsToISO8601(opts.timeAchievedMs),
				time_added: UnixMillisecondsToISO8601(opts.timeAddedMs),
				highlight: opts.highlight,
				comment: null,
			})
			.execute();
	}

	it("returns at most N recent sessions ordered by time_started desc", async () => {
		const { id: userId } = await seedUser({
			username: `act_sess_${Date.now()}`,
		});
		const base = 10_000_000;

		await insertIidxSession({
			userId,
			id: `act-s1-${base}`,
			timeStartedMs: base + 1000,
			timeEndedMs: base + 2000,
		});
		await insertIidxSession({
			userId,
			id: `act-s2-${base}`,
			timeStartedMs: base + 3000,
			timeEndedMs: base + 4000,
		});
		await insertIidxSession({
			userId,
			id: `act-s3-${base}`,
			timeStartedMs: base + 5000,
			timeEndedMs: base + 6000,
		});

		const result = await GetRecentActivity(
			"iidx",
			{ game: "iidx", playtype: "SP", userID: userId },
			2,
			null,
		);

		expect(result.recentSessions).toHaveLength(2);
		expect(result.recentSessions[0]?.sessionID).toBe(`act-s3-${base}`);
		expect(result.recentSessions[1]?.sessionID).toBe(`act-s2-${base}`);
	});

	it("returns only highlighted scores with time_achieved inside the session window", async () => {
		const { id: userId } = await seedUser({
			username: `act_hl_${Date.now()}`,
		});
		const base = 20_000_000;
		const chartIn = `act-ch-in-${base}`;
		const chartOut = `act-ch-out-${base}`;

		await insertIidxSession({
			userId,
			id: `act-win-old-${base}`,
			timeStartedMs: base,
			timeEndedMs: base + 1000,
		});
		await insertIidxSession({
			userId,
			id: `act-win-new-${base}`,
			timeStartedMs: base + 10_000,
			timeEndedMs: base + 11_000,
		});

		await seedIidxScore({
			userId,
			scoreId: `sc-in-${base}`,
			songId: `act-song-in-${base}`,
			chartId: chartIn,
			highlight: true,
			timeAchievedMs: base + 5000,
			timeAddedMs: base + 5000,
		});
		await seedIidxScore({
			userId,
			scoreId: `sc-out-${base}`,
			songId: `act-song-out-${base}`,
			chartId: chartOut,
			highlight: true,
			timeAchievedMs: base - 5000,
			timeAddedMs: base - 5000,
		});

		const result = await GetRecentActivity(
			"iidx",
			{ game: "iidx", playtype: "SP", userID: userId },
			2,
			null,
		);

		const ids = result.recentlyHighlightedScores.map((s) => s.scoreID);
		expect(ids).toContain(`sc-in-${base}`);
		expect(ids).not.toContain(`sc-out-${base}`);
	});

	it("maps class_prev_value empty string to classOldValue null", async () => {
		const { id: userId } = await seedUser({
			username: `act_cls_${Date.now()}`,
		});
		const base = 30_000_000;

		await insertIidxSession({
			userId,
			id: `act-cls-s-${base}`,
			timeStartedMs: base,
			timeEndedMs: base + 1000,
		});

		await DB.insertInto("class_achievement")
			.values({
				game: "iidx-sp",
				user_id: userId,
				class_set: "dan",
				class_prev_value: "",
				class_value: "DAN_1",
				timestamp: UnixMillisecondsToISO8601(base + 500),
			})
			.execute();

		const result = await GetRecentActivity(
			"iidx",
			{ game: "iidx", playtype: "SP", userID: userId },
			10,
			null,
		);

		expect(result.achievedClasses).toHaveLength(1);
		expect(result.achievedClasses[0]?.classOldValue).toBe(null);
		expect(result.achievedClasses[0]?.classValue).toBe("DAN_1");
	});

	it("returns no sessions, scores, or class rows when userID $in is empty", async () => {
		const result = await GetRecentActivity(
			"iidx",
			{ game: "iidx", playtype: "SP", userID: { $in: [] } },
			10,
			null,
		);

		expect(result.recentSessions).toHaveLength(0);
		expect(result.recentlyHighlightedScores).toHaveLength(0);
		expect(result.achievedClasses).toHaveLength(0);
		expect(result.goalSubs).toHaveLength(0);
		expect(result.questSubs).toHaveLength(0);
	});
});

describe("GET /api/v1/games/:game/:playtype/activity (smoke)", () => {
	it("returns success with seeded iidx SP activity", async () => {
		const { id: userId } = await seedUser({
			username: `act_api_${Date.now()}`,
		});
		const base = 40_000_000;

		await DB.insertInto("session")
			.values({
				id: `act-api-s-${base}`,
				user_id: userId,
				game: "iidx-sp",
				name: "api",
				description: null,
				time_inserted: UnixMillisecondsToISO8601(base + 1000),
				time_started: UnixMillisecondsToISO8601(base),
				time_ended: UnixMillisecondsToISO8601(base + 1000),
				calculated_data: JSON.stringify({}),
				highlight: false,
			})
			.execute();

		const res = await mockApi.get("/api/v1/games/iidx/SP/activity");

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.body.recentSessions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ sessionID: `act-api-s-${base}` }),
			]),
		);
	});
});
