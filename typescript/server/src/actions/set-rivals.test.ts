import { ServerConfig } from "#lib/setup/config";
import DB from "#services/pg/db";
import { seedUser } from "#test-utils/pg-fixtures";
import { beforeEach, describe, expect, it } from "vitest";

import { ACTION_SetRivals } from "./set-rivals";

describe("ACTION_SetRivals", () => {
	let userId: number;
	let username: string;
	let rivalId: number;

	beforeEach(async () => {
		({ id: userId, username } = await seedUser({ username: `rival_set_${Date.now()}` }));
		rivalId = (await seedUser({ username: `rival_target_${Date.now()}` })).id;

		const ugptRow = {
			game: "iidx-sp" as const,
			pf_preferred_score_alg: null,
			pf_preferred_session_alg: null,
			pf_preferred_profile_alg: null,
			pf_preferred_default_enum: null,
			pf_default_table: null,
			pf_preferred_ranking: null,
			data: JSON.stringify({ display2DXTra: false, bpiTarget: 0 }),
		};

		await DB.insertInto("game_settings")
			.values([
				{ user_id: userId, ...ugptRow },
				{ user_id: rivalId, ...ugptRow },
			])
			.execute();
	});

	it("replaces game_rival rows for the UGPT", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await ACTION_SetRivals(taker, {
			userID: userId,
			game: "iidx",
			playtype: "SP",
			rivalIDs: [rivalId],
		});

		const rows = await DB.selectFrom("game_rival")
			.selectAll()
			.where("user_id", "=", userId)
			.where("game", "=", "iidx-sp")
			.execute();

		expect(rows).toHaveLength(1);
		expect(rows[0]?.rival).toBe(rivalId);
	});

	it("writes a GOOD action row on success", async () => {
		const taker = { ip: "10.0.0.3", acct: { id: userId, username } };

		await ACTION_SetRivals(taker, {
			userID: userId,
			game: "iidx",
			playtype: "SP",
			rivalIDs: [rivalId],
		});

		const actionRow = await DB.selectFrom("action")
			.selectAll()
			.where("kind", "=", "SET_RIVALS")
			.executeTakeFirstOrThrow();

		expect(actionRow).toMatchObject({ result: "GOOD", ip: "10.0.0.3", user_id: userId });
	});

	it("throws 403 when targeting another user as non-admin", async () => {
		const other = await seedUser({ username: `other_rival_${Date.now()}` });
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await expect(
			ACTION_SetRivals(taker, {
				userID: other.id,
				game: "iidx",
				playtype: "SP",
				rivalIDs: [rivalId],
			}),
		).rejects.toMatchObject({ code: 403 });
	});

	it("throws 400 when rivaling yourself", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await expect(
			ACTION_SetRivals(taker, {
				userID: userId,
				game: "iidx",
				playtype: "SP",
				rivalIDs: [userId],
			}),
		).rejects.toMatchObject({ code: 400 });
	});

	it("throws 400 when more than MAX_RIVALS rivals are set", async () => {
		const main = await seedUser({ username: `too_many_${Date.now()}` });
		const rivalUsers = await Promise.all(
			Array.from({ length: ServerConfig.MAX_RIVALS + 1 }, (_, i) =>
				seedUser({ username: `too_many_r_${i}_${Date.now()}` }),
			),
		);

		const ugptRow = {
			game: "iidx-sp" as const,
			pf_preferred_score_alg: null,
			pf_preferred_session_alg: null,
			pf_preferred_profile_alg: null,
			pf_preferred_default_enum: null,
			pf_default_table: null,
			pf_preferred_ranking: null,
			data: JSON.stringify({ display2DXTra: false, bpiTarget: 0 }),
		};

		await DB.insertInto("game_settings")
			.values([
				{ user_id: main.id, ...ugptRow },
				...rivalUsers.map((u) => ({ user_id: u.id, ...ugptRow })),
			])
			.execute();

		const taker = { ip: "127.0.0.1", acct: { id: main.id, username: main.username } };

		await expect(
			ACTION_SetRivals(taker, {
				userID: main.id,
				game: "iidx",
				playtype: "SP",
				rivalIDs: rivalUsers.map((u) => u.id),
			}),
		).rejects.toMatchObject({ code: 400 });
	});
});
