import { ClearTestingRateLimitCache } from "#server/middleware/rate-limiter";
import DB from "#services/pg/db.js";
import mockApi, { CloseServerConnection } from "#test-utils/mock-api";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { HashPassword, PasswordCompare } from "./auth";

afterAll(() => CloseServerConnection());

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function seedUser(opts?: { email?: string; password?: string; username?: string }) {
	const username = opts?.username ?? "seed_user";
	const email = opts?.email ?? "seed@example.com";
	const password = opts?.password ?? "password123";

	const hashedPassword = await HashPassword(password);

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

	await DB.insertInto("priv_account_credential")
		.values({ user_id: id, email, password: hashedPassword })
		.execute();

	return { id, username, email, password };
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

// ─── POST /api/v1/auth/register ──────────────────────────────────────────────

describe("POST /api/v1/auth/register", () => {
	let inviteCode: string;

	beforeEach(async () => {
		ClearTestingRateLimitCache();
		const { id } = await seedUser();
		inviteCode = await seedInvite(id);
	});

	it("creates a new user and sets a session cookie", async () => {
		const res = await mockApi.post("/api/v1/auth/register").send({
			username: "newuser",
			"!password": "securepassword",
			email: "newuser@example.com",
			captcha: "test",
			inviteCode,
		});

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.body.username).toBe("newuser");
		expect(res.headers["set-cookie"]).toBeDefined();

		const created = await DB.selectFrom("account")
			.select("username")
			.where("username", "=", "newuser")
			.executeTakeFirst();

		expect(created?.username).toBe("newuser");
	});

	it("rejects a duplicate username (case-insensitive) with 409", async () => {
		const res = await mockApi.post("/api/v1/auth/register").send({
			username: "Seed_User",
			"!password": "securepassword",
			email: "other@example.com",
			captcha: "test",
			inviteCode,
		});

		expect(res.status).toBe(409);
		expect(res.body.success).toBe(false);
	});

	it("rejects a duplicate email with 409", async () => {
		const res = await mockApi.post("/api/v1/auth/register").send({
			username: "brandnewuser",
			"!password": "securepassword",
			email: "seed@example.com",
			captcha: "test",
			inviteCode,
		});

		expect(res.status).toBe(409);
		expect(res.body.success).toBe(false);
	});

	it("rejects an invalid email format with 400", async () => {
		const res = await mockApi.post("/api/v1/auth/register").send({
			username: "brandnewuser",
			"!password": "securepassword",
			email: "not-an-email",
			captcha: "test",
			inviteCode,
		});

		expect(res.status).toBe(400);
		expect(res.body.success).toBe(false);
	});

	it("rejects a password shorter than 8 characters with 400", async () => {
		const res = await mockApi.post("/api/v1/auth/register").send({
			username: "brandnewuser",
			"!password": "short",
			email: "brandnewuser@example.com",
			captcha: "test",
			inviteCode,
		});

		expect(res.status).toBe(400);
		expect(res.body.success).toBe(false);
	});

	it.each([
		["starts with a number", "1badname"],
		["too short (< 3 chars)", "ab"],
	])("rejects username that %s with 400", async (_, username) => {
		const res = await mockApi.post("/api/v1/auth/register").send({
			username,
			"!password": "securepassword",
			email: "someone@example.com",
			captcha: "test",
			inviteCode,
		});

		expect(res.status).toBe(400);
		expect(res.body.success).toBe(false);
	});

	it("rejects a missing invite code with 400", async () => {
		const res = await mockApi.post("/api/v1/auth/register").send({
			username: "brandnewuser",
			"!password": "securepassword",
			email: "brandnewuser@example.com",
			captcha: "test",
		});

		expect(res.status).toBe(400);
		expect(res.body.success).toBe(false);
	});

	it("does not consume the invite code on a failed registration", async () => {
		await mockApi.post("/api/v1/auth/register").send({
			username: "seed_user",
			"!password": "securepassword",
			email: "other@example.com",
			captcha: "test",
			inviteCode,
		});

		const invite = await DB.selectFrom("priv_invite")
			.select("consumed")
			.where("code", "=", inviteCode)
			.executeTakeFirstOrThrow();

		expect(invite.consumed).toBe(false);
	});

	it("marks the invite code as consumed on success", async () => {
		await mockApi.post("/api/v1/auth/register").send({
			username: "newuser",
			"!password": "securepassword",
			email: "newuser@example.com",
			captcha: "test",
			inviteCode,
		});

		const invite = await DB.selectFrom("priv_invite")
			.select("consumed")
			.where("code", "=", inviteCode)
			.executeTakeFirstOrThrow();

		expect(invite.consumed).toBe(true);
	});
});

// ─── POST /api/v1/auth/login ─────────────────────────────────────────────────

describe("POST /api/v1/auth/login", () => {
	beforeEach(async () => {
		ClearTestingRateLimitCache();
		await seedUser();
	});

	it("returns 200 and a session cookie with correct credentials", async () => {
		const res = await mockApi.post("/api/v1/auth/login").send({
			username: "seed_user",
			"!password": "password123",
			captcha: "test",
		});

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.body.userID).toBeDefined();
		expect(res.headers["set-cookie"]).toBeDefined();
	});

	it("session cookie grants authenticated access", async () => {
		const loginRes = await mockApi.post("/api/v1/auth/login").send({
			username: "seed_user",
			"!password": "password123",
			captcha: "test",
		});

		const cookie = loginRes.headers["set-cookie"] as unknown as string[];
		const userID = loginRes.body.body.userID;

		const statusRes = await mockApi.get("/api/v1/status").set("Cookie", cookie);

		expect(statusRes.status).toBe(200);
		expect(statusRes.body.body.whoami).toBe(userID);
	});

	it("allows re-login when already logged in", async () => {
		const first = await mockApi.post("/api/v1/auth/login").send({
			username: "seed_user",
			"!password": "password123",
			captcha: "test",
		});

		const second = await mockApi
			.post("/api/v1/auth/login")
			.set("Cookie", first.headers["set-cookie"] as unknown as string[])
			.send({
				username: "seed_user",
				"!password": "password123",
				captcha: "test",
			});

		expect(second.status).toBe(200);
	});

	it("returns 403 with incorrect password", async () => {
		const res = await mockApi.post("/api/v1/auth/login").send({
			username: "seed_user",
			"!password": "wrongpassword",
			captcha: "test",
		});

		expect(res.status).toBe(403);
		expect(res.body.success).toBe(false);
	});

	it("returns 404 for a non-existent username", async () => {
		const res = await mockApi.post("/api/v1/auth/login").send({
			username: "nobody_here",
			"!password": "password123",
			captcha: "test",
		});

		expect(res.status).toBe(404);
		expect(res.body.success).toBe(false);
	});

	it("returns 400 when password is missing", async () => {
		const res = await mockApi.post("/api/v1/auth/login").send({
			username: "seed_user",
			captcha: "test",
		});

		expect(res.status).toBe(400);
	});

	it("returns 400 when username is missing", async () => {
		const res = await mockApi.post("/api/v1/auth/login").send({
			"!password": "password123",
			captcha: "test",
		});

		expect(res.status).toBe(400);
	});

	it("returns 400 when captcha is missing", async () => {
		const res = await mockApi.post("/api/v1/auth/login").send({
			username: "seed_user",
			"!password": "password123",
		});

		expect(res.status).toBe(400);
	});
});

// ─── POST /api/v1/auth/logout ────────────────────────────────────────────────

describe("POST /api/v1/auth/logout", () => {
	beforeEach(async () => {
		ClearTestingRateLimitCache();
		await seedUser();
	});

	it("returns 409 when not logged in", async () => {
		const res = await mockApi.post("/api/v1/auth/logout");

		expect(res.status).toBe(409);
		expect(res.body.success).toBe(false);
	});

	it("returns 200 and destroys the session when logged in", async () => {
		const loginRes = await mockApi.post("/api/v1/auth/login").send({
			username: "seed_user",
			"!password": "password123",
			captcha: "test",
		});

		const cookie = loginRes.headers["set-cookie"] as unknown as string[];

		const logoutRes = await mockApi.post("/api/v1/auth/logout").set("Cookie", cookie);

		expect(logoutRes.status).toBe(200);
		expect(logoutRes.body.success).toBe(true);
	});
});

// ─── POST /api/v1/auth/reset-password ────────────────────────────────────────

describe("POST /api/v1/auth/reset-password", () => {
	beforeEach(async () => {
		ClearTestingRateLimitCache();
		await seedUser();
	});

	it("updates the password when a valid reset code is supplied", async () => {
		const { id } = await DB.selectFrom("account")
			.select("id")
			.where("username", "=", "seed_user")
			.executeTakeFirstOrThrow();

		await DB.insertInto("priv_password_reset_token")
			.values({
				token: "RESET_TOKEN",
				user_id: id,
				created_on: new Date().toISOString(),
			})
			.execute();

		const res = await mockApi.post("/api/v1/auth/reset-password").send({
			code: "RESET_TOKEN",
			"!password": "brand_new_password",
		});

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);

		const cred = await DB.selectFrom("priv_account_credential")
			.select("password")
			.where("user_id", "=", id)
			.executeTakeFirstOrThrow();

		expect(await PasswordCompare("brand_new_password", cred.password)).toBe(true);

		const canLoginWithNewPassword = await mockApi.post("/api/v1/auth/login").send({
			username: "seed_user",
			"!password": "brand_new_password",
			captcha: "test",
		});

		expect(canLoginWithNewPassword.status).toBe(200);
	});
});
