import type { GuildMember } from "discord.js";

import pgDb from "#services/pg/db";
import { createTestAccount } from "#test-utils/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionTaker } from "../actions";

import { ACTION_Letmein } from "./letmein";

describe("ACTION_Letmein", () => {
	let taker: ActionTaker;

	beforeEach(async () => {
		const acct = await createTestAccount("letmeinuser", "letmein-token-cccc");
		taker = { acct: { id: acct.id, username: acct.username }, ip: "127.0.0.1" };
	});

	it("calls member.roles.add with the provided role_id", async () => {
		const addRole = vi.fn().mockResolvedValue(undefined);
		const member = { roles: { add: addRole } } as unknown as GuildMember;
		const roleId = "987654321098765432";

		await ACTION_Letmein(taker, {
			discord_user_id: "111222333",
			role_id: roleId,
			"!member": member,
		});

		expect(addRole).toHaveBeenCalledOnce();
		expect(addRole).toHaveBeenCalledWith(roleId);
	});

	it("returns an empty object on success", async () => {
		const member = {
			roles: { add: vi.fn().mockResolvedValue(undefined) },
		} as unknown as GuildMember;

		const result = await ACTION_Letmein(taker, {
			discord_user_id: "111222333",
			role_id: "any-role",
			"!member": member,
		});

		expect(result).toEqual({});
	});

	it("writes a GOOD action row to the audit log", async () => {
		const member = {
			roles: { add: vi.fn().mockResolvedValue(undefined) },
		} as unknown as GuildMember;
		const discordUserId = "555666777888999000";
		const roleId = "123456789012345678";

		await ACTION_Letmein(taker, {
			discord_user_id: discordUserId,
			role_id: roleId,
			"!member": member,
		});

		const action = await pgDb
			.selectFrom("action")
			.selectAll()
			.where("kind", "=", "LETMEIN")
			.executeTakeFirst();

		// node-pg returns BIGINT columns as strings
		expect(action).toMatchObject({
			app: "BOT",
			kind: "LETMEIN",
			result: "GOOD",
			user_id: String(taker.acct.id),
		});

		// The GuildMember object must not appear in the audit log input
		const input = action?.input as Record<string, unknown>;
		expect(input).not.toHaveProperty("!member");
		expect(input).toMatchObject({ discord_user_id: discordUserId, role_id: roleId });
	});

	it("propagates errors and writes a THROW action row to the audit log", async () => {
		const boom = new Error("Discord API down");
		const member = {
			roles: { add: vi.fn().mockRejectedValue(boom) },
		} as unknown as GuildMember;

		await expect(
			ACTION_Letmein(taker, {
				discord_user_id: "111",
				role_id: "222",
				"!member": member,
			}),
		).rejects.toThrow("Discord API down");

		const action = await pgDb
			.selectFrom("action")
			.selectAll()
			.where("kind", "=", "LETMEIN")
			.executeTakeFirst();

		expect(action?.result).toBe("THROW");
	});
});
