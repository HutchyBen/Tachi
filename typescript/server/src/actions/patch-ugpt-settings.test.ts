import { SELECT_ACTION } from "#lib/db-formats/action";
import {
	GetUGPTSettingsDocument,
	SELECT_GAME_PROFILE_SETTINGS,
} from "#lib/db-formats/ugpt-settings";
import { newGameProfilePreferenceColumns } from "#lib/game-settings/create-game-settings";
import DB from "#services/pg/db";
import { seedUser } from "#test-utils/pg-fixtures";
import { beforeEach, describe, expect, it } from "vitest";

import { ACTION_PatchUGPTSettings } from "./patch-ugpt-settings";

describe("ACTION_PatchUGPTSettings", () => {
	let userId: number;
	let username: string;

	beforeEach(async () => {
		({ id: userId, username } = await seedUser({ username: `ugpt_set_${Date.now()}` }));

		await DB.insertInto("game_profile")
			.values({
				user_id: userId,
				game: "iidx-sp",
				ratings: JSON.stringify({}),
				classes: JSON.stringify({}),
				...newGameProfilePreferenceColumns("iidx-sp"),
			})
			.execute();
	});

	it("updates preferred score algorithm", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await ACTION_PatchUGPTSettings(taker, {
			userID: userId,
			game: "iidx-sp",
			preferences: { preferredScoreAlg: "ktLampRating" },
		});

		const settings = await GetUGPTSettingsDocument(userId, "iidx-sp");

		expect(settings?.preferences.preferredScoreAlg).toBe("ktLampRating");

		const row = await DB.selectFrom("game_profile")
			.select(SELECT_GAME_PROFILE_SETTINGS)
			.where("game_profile.user_id", "=", userId)
			.where("game_profile.game", "=", "iidx-sp")
			.executeTakeFirstOrThrow();

		expect(row.pf_preferred_score_alg).toBe("ktLampRating");
	});

	it("writes a GOOD action row on success", async () => {
		const taker = { ip: "10.0.0.2", acct: { id: userId, username } };

		await ACTION_PatchUGPTSettings(taker, {
			userID: userId,
			game: "iidx-sp",
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
				game: "iidx-sp",
				preferences: { preferredScoreAlg: "ktLampRating" },
			}),
		).rejects.toMatchObject({ code: 403 });
	});
});
