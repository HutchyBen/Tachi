import { HashPassword } from "#server/router/api/v1/auth/auth.js";
import DB from "#services/pg/db.js";
import { beforeEach, describe, expect, it } from "vitest";

import { ANON_ACTION_Register } from "./register.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedUser(opts?: { email?: string; username?: string }) {
	const username = opts?.username ?? "seed_user";
	const email = opts?.email ?? "seed@example.com";

	const { id } = await DB.insertInto("account")
		.values({
			username,
			about: "Seed user for tests.",
			joined: new Date().toISOString(),
			last_seen: new Date().toISOString(),
			auth_level: "user",
			custom_pfp_location: null,
			custom_banner_location: null,
		})
		.returning("id")
		.executeTakeFirstOrThrow();

	await DB.insertInto("account_settings")
		.values({
			user_id: id,
			pf_invisible: false,
			pf_developer_mode: false,
			pf_advanced_mode: false,
			pf_contentious_content: false,
			pf_deletable_scores: false,
		})
		.execute();

	const hashedPassword = await HashPassword("password123");

	await DB.insertInto("priv_account_credential")
		.values({ user_id: id, email, password: hashedPassword })
		.execute();

	return { id, username, email };
}

async function seedInvite(createdBy: number, code = "INVITE_CODE") {
	await DB.insertInto("priv_invite")
		.values({
			code,
			created_by: createdBy,
			created_at: new Date().toISOString(),
			consumed: false,
			consumed_by: null,
			consumed_at: null,
		})
		.execute();

	return code;
}

// ─── ANON_ACTION_Register ─────────────────────────────────────────────────────

describe("ANON_ACTION_Register", () => {
	const taker = { ip: "127.0.0.1" };

	let inviteCode: string;

	beforeEach(async () => {
		const { id } = await seedUser();
		inviteCode = await seedInvite(id);
	});

	// ── Happy path ─────────────────────────────────────────────────────────────

	it("returns the new user's ID on success", async () => {
		const result = await ANON_ACTION_Register(taker, {
			username: "newuser",
			"!password": "securepassword",
			email: "newuser@example.com",
			captcha: "test",
			inviteCode,
		});

		expect(Number(result.userID)).toBeGreaterThan(0);
	});

	it("inserts the account row into the database", async () => {
		await ANON_ACTION_Register(taker, {
			username: "newuser",
			"!password": "securepassword",
			email: "newuser@example.com",
			captcha: "test",
			inviteCode,
		});

		const user = await DB.selectFrom("account")
			.select("username")
			.where("username", "=", "newuser")
			.executeTakeFirst();

		expect(user?.username).toBe("newuser");
	});

	it("forces the stored email to lowercase", async () => {
		const { userID } = await ANON_ACTION_Register(taker, {
			username: "newuser",
			"!password": "securepassword",
			email: "NewUser@Example.COM",
			captcha: "test",
			inviteCode,
		});

		const cred = await DB.selectFrom("priv_account_credential")
			.select("email")
			.where("user_id", "=", userID)
			.executeTakeFirstOrThrow();

		expect(cred.email).toBe("newuser@example.com");
	});

	it("marks the invite code as consumed on success", async () => {
		await ANON_ACTION_Register(taker, {
			username: "newuser",
			"!password": "securepassword",
			email: "newuser@example.com",
			captcha: "test",
			inviteCode,
		});

		const invite = await DB.selectFrom("priv_invite")
			.select(["consumed", "consumed_by"])
			.where("code", "=", inviteCode)
			.executeTakeFirstOrThrow();

		expect(invite.consumed).toBe(true);
		expect(invite.consumed_by).toBeDefined();
	});

	it("writes a GOOD action row to the audit log on success", async () => {
		await ANON_ACTION_Register(taker, {
			username: "newuser",
			"!password": "securepassword",
			email: "newuser@example.com",
			captcha: "test",
			inviteCode,
		});

		const action = await DB.selectFrom("action")
			.selectAll()
			.where("kind", "=", "REGISTER")
			.executeTakeFirstOrThrow();

		expect(action).toMatchObject({
			kind: "REGISTER",
			result: "GOOD",
			ip: "127.0.0.1",
		});
	});

	// ── Conflicting username / email ───────────────────────────────────────────

	it("throws 409 when username is already taken", async () => {
		await expect(
			ANON_ACTION_Register(taker, {
				username: "seed_user",
				"!password": "securepassword",
				email: "other@example.com",
				captcha: "test",
				inviteCode,
			}),
		).rejects.toMatchObject({ code: 409 });
	});

	it("throws 409 when username is already taken (case-insensitive)", async () => {
		await expect(
			ANON_ACTION_Register(taker, {
				username: "SEED_USER",
				"!password": "securepassword",
				email: "other@example.com",
				captcha: "test",
				inviteCode,
			}),
		).rejects.toMatchObject({ code: 409 });
	});

	it("throws 409 when email is already in use", async () => {
		await expect(
			ANON_ACTION_Register(taker, {
				username: "brandnewuser",
				"!password": "securepassword",
				email: "seed@example.com",
				captcha: "test",
				inviteCode,
			}),
		).rejects.toMatchObject({ code: 409 });
	});

	it("treats the input email as case-insensitive before checking for duplicates", async () => {
		await expect(
			ANON_ACTION_Register(taker, {
				username: "brandnewuser",
				"!password": "securepassword",
				email: "SEED@EXAMPLE.COM",
				captcha: "test",
				inviteCode,
			}),
		).rejects.toMatchObject({ code: 409 });
	});

	// ── Invite code ────────────────────────────────────────────────────────────

	it("throws 400 when no invite code is given and the server requires invites", async () => {
		await expect(
			ANON_ACTION_Register(taker, {
				username: "brandnewuser",
				"!password": "securepassword",
				email: "brandnewuser@example.com",
				captcha: "test",
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				inviteCode: undefined as any,
			}),
		).rejects.toMatchObject({ code: 400 });
	});

	it("throws when the invite code does not exist", async () => {
		await expect(
			ANON_ACTION_Register(taker, {
				username: "brandnewuser",
				"!password": "securepassword",
				email: "brandnewuser@example.com",
				captcha: "test",
				inviteCode: "BOGUS_CODE",
			}),
		).rejects.toThrow();
	});

	it("does not consume the invite code on a failed registration", async () => {
		await expect(
			ANON_ACTION_Register(taker, {
				username: "seed_user",
				"!password": "securepassword",
				email: "other@example.com",
				captcha: "test",
				inviteCode,
			}),
		).rejects.toThrow();

		const invite = await DB.selectFrom("priv_invite")
			.select("consumed")
			.where("code", "=", inviteCode)
			.executeTakeFirstOrThrow();

		expect(invite.consumed).toBe(false);
	});

	it("does not insert a partial user when the invite code is invalid", async () => {
		await expect(
			ANON_ACTION_Register(taker, {
				username: "newuser",
				"!password": "securepassword",
				email: "newuser@example.com",
				captcha: "test",
				inviteCode: "BOGUS_CODE",
			}),
		).rejects.toThrow();

		const user = await DB.selectFrom("account")
			.select("username")
			.where("username", "=", "newuser")
			.executeTakeFirst();

		expect(user).toBeUndefined();
	});

	// ── Audit log ──────────────────────────────────────────────────────────────

	it("writes a BAD action row when the username is already taken", async () => {
		await expect(
			ANON_ACTION_Register(taker, {
				username: "seed_user",
				"!password": "securepassword",
				email: "other@example.com",
				captcha: "test",
				inviteCode,
			}),
		).rejects.toThrow();

		const action = await DB.selectFrom("action")
			.select("result")
			.where("kind", "=", "REGISTER")
			.executeTakeFirstOrThrow();

		expect(action.result).toBe("BAD");
	});

	it("writes a BAD action row when the email is already in use", async () => {
		await expect(
			ANON_ACTION_Register(taker, {
				username: "brandnewuser",
				"!password": "securepassword",
				email: "seed@example.com",
				captcha: "test",
				inviteCode,
			}),
		).rejects.toThrow();

		const action = await DB.selectFrom("action")
			.select("result")
			.where("kind", "=", "REGISTER")
			.executeTakeFirstOrThrow();

		expect(action.result).toBe("BAD");
	});

	it("omits the password from the audit log input", async () => {
		await ANON_ACTION_Register(taker, {
			username: "newuser",
			"!password": "securepassword",
			email: "newuser@example.com",
			captcha: "test",
			inviteCode,
		});

		const action = await DB.selectFrom("action")
			.select("input")
			.where("kind", "=", "REGISTER")
			.executeTakeFirstOrThrow();

		const input = action.input as Record<string, unknown>;

		expect(input).not.toHaveProperty("!password");
	});
});
