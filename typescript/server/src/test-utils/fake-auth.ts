import type supertest from "supertest";

import { log } from "#lib/log/log.js";
import { ClearTestingRateLimitCache } from "#server/middleware/rate-limiter";
import db from "#services/mongo/db";

import { ALL_PERMISSIONS } from "tachi-common";
import ResetDBState from "./resets";

export async function CreateFakeAuthCookie(mockApi: supertest.SuperTest<supertest.Test>) {
	await ResetDBState();
	ClearTestingRateLimitCache();

	// possible security issue, ask hazel
	const res = await mockApi.post("/api/v1/auth/login").send({
		username: "test_zkldi",
		"!password": "password",
		captcha: "asdf",
	});

	if (res.status !== 200) {
		log.fatal("Failed to login. Cannot generate auth cookie.");
		throw res.body;
	}

	const headers = res.headers as Record<string, string>;

	const setCookieHeader: string | undefined = headers["set-cookie"];

	if (setCookieHeader === undefined) {
		throw new Error(`Failed to login, no Set-Cookie returned in response?`);
	}

	return [setCookieHeader];
}

export function InsertFakeTokenWithAllPerms(token: string): () => Promise<any> {
	return () =>
		db["api-tokens"].insert({
			userID: 1,
			identifier: "Mock API Token",
			permissions: ALL_PERMISSIONS,
			token,
			fromAPIClient: null,
		});
}
