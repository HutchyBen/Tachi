import { SELECT_ACTION } from "#lib/db-formats/action";
import { GetUGPTSettingsDocument, SELECT_GAME_SETTINGS } from "#lib/db-formats/ugpt-settings.js";
import DB from "#services/pg/db";
import { seedUser } from "#test-utils/pg-fixtures";
import { beforeEach, describe, expect, it } from "vitest";

import { ACTION_PatchUGPTSettings } from "./patch-ugpt-settings";

describe("ACTION_PatchUGPTSettings", () => {
	let userId: number;
	let username: string;

	beforeEach(async () => {
		({ id: userId, username } = await seedUser({ username: `ugpt_set_${Date.now()}` }));

		await DB.insertInto("game_settings")
			.values({
				user_id: userId,
				game: "iidx-sp",
				pf_preferred_score_alg: null,
				pf_preferred_session_alg: null,
				pf_preferred_profile_alg: null,
				pf_preferred_default_enum: null,
				pf_default_table: null,
				pf_preferred_ranking: null,
				data: JSON.stringify({ display2DXTra: false, bpiTarget: 0 }),
			})
			.execute();
	});

	it("updates preferred score algorithm", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await ACTION_PatchUGPTSettings(taker, {
			userID: userId,
			game: "iidx",
			playtype: "SP",
			preferences: { preferredScoreAlg: "ktLampRating" },
		});

		const settings = await GetUGPTSettingsDocument(userId, "iidx", "SP");

		expect(settings?.preferences.preferredScoreAlg).toBe("ktLampRating");

		const row = await DB.selectFrom("game_settings")
			.select(SELECT_GAME_SETTINGS)
			.where("game_settings.user_id", "=", userId)
			.where("game_settings.game", "=", "iidx-sp")
			.executeTakeFirstOrThrow();

		expect(row.pf_preferred_score_alg).toBe("ktLampRating");
	});

	it("writes a GOOD action row on success", async () => {
		const taker = { ip: "10.0.0.2", acct: { id: userId, username } };

		await ACTION_PatchUGPTSettings(taker, {
			userID: userId,
			game: "iidx",
			playtype: "SP",
			preferences: { preferredProfileAlg: "ktRating" },
		});

		const actionRow = await DB.selectFrom("action")
			.select(SELECT_ACTION)
			.where("action.kind", "=", "PATCH_UGPT_SETTINGS")
			.executeTakeFirstOrThrow();

		expect(actionRow).toMatchObject({ result: "GOOD", ip: "10.0.0.2", user_id: userId });
	});

	it("throws 403 when targeting another user as non-admin", async () => {
		const other = await seedUser({ username: `other_${Date.now()}` });
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await expect(
			ACTION_PatchUGPTSettings(taker, {
				userID: other.id,
				game: "iidx",
				playtype: "SP",
				preferences: { preferredScoreAlg: "ktLampRating" },
			}),
		).rejects.toMatchObject({ code: 403 });
	});
});
