import DB from "#services/pg/db.js";
import { beforeEach, describe, expect, it } from "vitest";

import { ANON_ACTION_ForgotPassword } from "./forgot-password.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function seedUser(opts?: { email?: string; username?: string }) {
	const username = opts?.username ?? "test_user";
	const email = opts?.email ?? "test@example.com";

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

	await DB.insertInto("priv_account_credential")
		.values({ user_id: id, email, password: "hashed_password_placeholder" })
		.execute();

	return { id: Number(id), username, email };
}

// ─── ANON_ACTION_ForgotPassword ───────────────────────────────────────────────

describe("ANON_ACTION_ForgotPassword", () => {
	const taker = { ip: "127.0.0.1" };

	let user: Awaited<ReturnType<typeof seedUser>>;

	beforeEach(async () => {
		user = await seedUser();
	});

	// ── Happy path ─────────────────────────────────────────────────────────────

	it("returns { silentlyRejected: false } when the email is found", async () => {
		const result = await ANON_ACTION_ForgotPassword(taker, { email: user.email });

		expect(result).toEqual({ silentlyRejected: false });
	});

	it("inserts a password reset token into priv_password_reset_token", async () => {
		await ANON_ACTION_ForgotPassword(taker, { email: user.email });

		const row = await DB.selectFrom("priv_password_reset_token")
			.select("token")
			.where("user_id", "=", user.id)
			.executeTakeFirst();

		expect(row).toBeDefined();
	});

	it("generates a token starting with M followed by 40 hex characters", async () => {
		await ANON_ACTION_ForgotPassword(taker, { email: user.email });

		const row = await DB.selectFrom("priv_password_reset_token")
			.select("token")
			.where("user_id", "=", user.id)
			.executeTakeFirstOrThrow();

		expect(row.token).toMatch(/^M[0-9a-f]{40}$/u);
	});

	it("lowercases the email before the lookup, so lookups are case-insensitive", async () => {
		const result = await ANON_ACTION_ForgotPassword(taker, {
			email: "TEST@EXAMPLE.COM",
		});

		expect(result).toEqual({ silentlyRejected: false });
	});

	it("each call inserts a new token row rather than updating the existing one", async () => {
		await ANON_ACTION_ForgotPassword(taker, { email: user.email });
		await ANON_ACTION_ForgotPassword(taker, { email: user.email });

		const rows = await DB.selectFrom("priv_password_reset_token")
			.select("token")
			.where("user_id", "=", user.id)
			.execute();

		expect(rows).toHaveLength(2);
		expect(rows[0]!.token).not.toBe(rows[1]!.token);
	});

	it("writes a GOOD action row to the audit log on success", async () => {
		await ANON_ACTION_ForgotPassword(taker, { email: user.email });

		const action = await DB.selectFrom("action")
			.selectAll()
			.where("kind", "=", "FORGOT_PASSWORD")
			.executeTakeFirstOrThrow();

		expect(action).toMatchObject({
			kind: "FORGOT_PASSWORD",
			result: "GOOD",
			ip: "127.0.0.1",
		});
	});

	// ── Null IP address ────────────────────────────────────────────────────────

	it("throws 400 when the IP address is null", async () => {
		const nullIpTaker = { ip: null };

		await expect(
			ANON_ACTION_ForgotPassword(nullIpTaker, { email: user.email }),
		).rejects.toMatchObject({ code: 400 });
	});

	it("writes a BAD action row when the IP address is null", async () => {
		const nullIpTaker = { ip: null };

		await expect(
			ANON_ACTION_ForgotPassword(nullIpTaker, { email: user.email }),
		).rejects.toThrow();

		const action = await DB.selectFrom("action")
			.select("result")
			.where("kind", "=", "FORGOT_PASSWORD")
			.executeTakeFirstOrThrow();

		expect(action.result).toBe("BAD");
	});

	it("does not insert any token when the IP address is null", async () => {
		const nullIpTaker = { ip: null };

		await expect(
			ANON_ACTION_ForgotPassword(nullIpTaker, { email: user.email }),
		).rejects.toThrow();

		const rows = await DB.selectFrom("priv_password_reset_token")
			.select("token")
			.where("user_id", "=", user.id)
			.execute();

		expect(rows).toHaveLength(0);
	});

	// ── Email not found ────────────────────────────────────────────────────────

	it("throws when no account is registered with the given email", async () => {
		await expect(
			ANON_ACTION_ForgotPassword(taker, { email: "nobody@example.com" }),
		).rejects.toThrow();
	});

	it("writes a THROW action row when the email is not found (dead executeTakeFirstOrThrow)", async () => {
		await expect(
			ANON_ACTION_ForgotPassword(taker, { email: "nobody@example.com" }),
		).rejects.toThrow();

		const action = await DB.selectFrom("action")
			.select("result")
			.where("kind", "=", "FORGOT_PASSWORD")
			.executeTakeFirstOrThrow();

		// executeTakeFirstOrThrow raises a raw NoResultError (not an ExpectedErr),
		// so the audit framework marks it THROW rather than BAD.
		// Note: the silentlyRejected branch in the source is dead code.
		expect(action.result).toBe("THROW");
	});

	it("does not insert any token when the email is not found", async () => {
		await expect(
			ANON_ACTION_ForgotPassword(taker, { email: "nobody@example.com" }),
		).rejects.toThrow();

		const rows = await DB.selectFrom("priv_password_reset_token")
			.select("token")
			.where("user_id", "=", user.id)
			.execute();

		expect(rows).toHaveLength(0);
	});

	// ── Token isolation ────────────────────────────────────────────────────────

	it("only inserts a token for the matching user, not for others", async () => {
		const other = await seedUser({ username: "other_user", email: "other@example.com" });

		await ANON_ACTION_ForgotPassword(taker, { email: user.email });

		const otherRows = await DB.selectFrom("priv_password_reset_token")
			.select("token")
			.where("user_id", "=", other.id)
			.execute();

		expect(otherRows).toHaveLength(0);
	});
});
