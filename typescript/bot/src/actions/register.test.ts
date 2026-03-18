import pgDb from "#services/pg/db";
import { createTestAccount } from "#test-utils/db";
import { beforeEach, describe, expect, it } from "vitest";

import { ACTION_Register } from "./register";

describe("ACTION_Register", () => {
	let userId: number;
	let apiToken: string;
	const taker = { ip: "127.0.0.1" };
	const discordId = "111222333444555666";

	beforeEach(async () => {
		const acct = await createTestAccount("registeruser", "reg-token-bbbb");
		userId = acct.id;
		apiToken = acct.apiToken;
	});

	it("inserts a new mapping and returns was_update: false", async () => {
		const result = await ACTION_Register(taker, {
			user_id: userId,
			discord_id: discordId,
			"!api_token": apiToken,
		});

		expect(result).toEqual({ was_update: false });

		const row = await pgDb
			.selectFrom("priv_discord_user_map")
			.selectAll()
			.where("user_id", "=", userId)
			.executeTakeFirst();

		// node-pg returns BIGINT columns as strings
		expect(row).toMatchObject({
			user_id: String(userId),
			discord_id: discordId,
			api_token: apiToken,
		});
	});

	it("updates an existing mapping and returns was_update: true", async () => {
		// First registration
		await ACTION_Register(taker, {
			user_id: userId,
			discord_id: discordId,
			"!api_token": apiToken,
		});

		const newDiscordId = "999888777666555444";

		const result = await ACTION_Register(taker, {
			user_id: userId,
			discord_id: newDiscordId,
			"!api_token": apiToken,
		});

		expect(result).toEqual({ was_update: true });

		const row = await pgDb
			.selectFrom("priv_discord_user_map")
			.selectAll()
			.where("user_id", "=", userId)
			.executeTakeFirst();

		expect(row?.discord_id).toBe(newDiscordId);
	});

	it("writes a GOOD action row to the audit log", async () => {
		await ACTION_Register(taker, {
			user_id: userId,
			discord_id: discordId,
			"!api_token": apiToken,
		});

		const action = await pgDb
			.selectFrom("action")
			.selectAll()
			.where("kind", "=", "REGISTER")
			.executeTakeFirst();

		expect(action).toMatchObject({
			app: "BOT",
			kind: "REGISTER",
			result: "GOOD",
			user_id: null,
			ip: "127.0.0.1",
		});

		// Private field must be stripped from the audit log input
		const input = action?.input as Record<string, unknown>;
		expect(input).not.toHaveProperty("!api_token");
		expect(input).toMatchObject({ user_id: userId, discord_id: discordId });
	});
});
