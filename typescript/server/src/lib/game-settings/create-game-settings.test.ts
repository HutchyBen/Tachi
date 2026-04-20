import DB from "#services/pg/db";
import { seedUser } from "#test-utils/pg-fixtures";
import { describe, expect, it } from "vitest";

import { CreateGameSettings } from "./create-game-settings";

describe("CreateGameSettings", () => {
	it("creates settings for a new user and game", async () => {
		const { id: userId } = await seedUser();

		await CreateGameSettings(userId, "bms-7k");

		const row = await DB.selectFrom("game_settings")
			.selectAll()
			.where("user_id", "=", userId)
			.where("game", "=", "bms-7k")
			.executeTakeFirst();

		expect(row).not.toBeUndefined();
		expect(row?.game).toBe("bms-7k");
	});

	it("throws if settings already exist", async () => {
		const { id } = await seedUser();
		const localUserId = id;

		try {
			await CreateGameSettings(localUserId, "popn");
			await expect(CreateGameSettings(localUserId, "popn")).rejects.toThrow(
				/Cannot create .* game-settings as one already exists/u,
			);
		} finally {
			await DB.deleteFrom("game_settings").where("user_id", "=", localUserId).execute();
			await DB.deleteFrom("account").where("id", "=", localUserId).execute();
		}
	});
});
