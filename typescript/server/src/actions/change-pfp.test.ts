import { CDNDelete, CDNStoreOrOverwrite } from "#lib/cdn/cdn";
import { GetProfileBannerURL, GetProfilePictureURL } from "#lib/cdn/url-format";
import DB from "#services/pg/db";
import { seedUser } from "#test-utils/pg-fixtures";
import { HashSHA256 } from "#utils/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ACTION_ChangeBanner } from "./change-banner";
import { ACTION_ChangePfp } from "./change-pfp";
import { ACTION_DeleteBanner } from "./delete-banner";
import { ACTION_DeletePfp } from "./delete-pfp";

vi.mock("#lib/cdn/cdn.js", () => ({
	CDNStoreOrOverwrite: vi.fn().mockResolvedValue(undefined),
	CDNDelete: vi.fn().mockResolvedValue(undefined),
	CDNRedirect: vi.fn(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const JPEG_BUFFER = Buffer.from("fake-jpeg-data");
const PNG_BUFFER = Buffer.from("fake-png-data");
const GIF_BUFFER = Buffer.from("fake-gif-data");
const BAD_BUFFER = Buffer.from("fake-webp-data");

async function getPfpLocation(userId: number) {
	const row = await DB.selectFrom("account")
		.select("custom_pfp_location")
		.where("id", "=", userId)
		.executeTakeFirstOrThrow();

	return row.custom_pfp_location;
}

async function getBannerLocation(userId: number) {
	const row = await DB.selectFrom("account")
		.select("custom_banner_location")
		.where("id", "=", userId)
		.executeTakeFirstOrThrow();

	return row.custom_banner_location;
}

async function seedUserWithPfp(userId: number, hash: string) {
	await DB.updateTable("account")
		.set({ custom_pfp_location: hash })
		.where("id", "=", userId)
		.execute();
}

async function seedUserWithBanner(userId: number, hash: string) {
	await DB.updateTable("account")
		.set({ custom_banner_location: hash })
		.where("id", "=", userId)
		.execute();
}

// ─── ACTION_ChangePfp ─────────────────────────────────────────────────────────

describe("ACTION_ChangePfp", () => {
	let userId: number;
	let username: string;

	beforeEach(async () => {
		vi.clearAllMocks();
		({ id: userId, username } = await seedUser({ username: "test_user" }));
	});

	// ── Mimetype validation ───────────────────────────────────────────────────

	it("returns { contentHash } for a JPEG file", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		const result = await ACTION_ChangePfp(taker, {
			"!fileBuffer": JPEG_BUFFER,
			fileMimetype: "image/jpeg",
		});

		expect(result).toMatchObject({ contentHash: HashSHA256(JPEG_BUFFER) });
	});

	it("returns { contentHash } for a PNG file", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		const result = await ACTION_ChangePfp(taker, {
			"!fileBuffer": PNG_BUFFER,
			fileMimetype: "image/png",
		});

		expect(result).toMatchObject({ contentHash: HashSHA256(PNG_BUFFER) });
	});

	it("returns { contentHash } for a GIF file", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		const result = await ACTION_ChangePfp(taker, {
			"!fileBuffer": GIF_BUFFER,
			fileMimetype: "image/gif",
		});

		expect(result).toMatchObject({ contentHash: HashSHA256(GIF_BUFFER) });
	});

	it("throws 400 for an unsupported mimetype", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await expect(
			ACTION_ChangePfp(taker, { "!fileBuffer": BAD_BUFFER, fileMimetype: "image/webp" }),
		).rejects.toMatchObject({ code: 400 });
	});

	// ── Database updates ──────────────────────────────────────────────────────

	it("persists the content hash to custom_pfp_location", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await ACTION_ChangePfp(taker, { "!fileBuffer": JPEG_BUFFER, fileMimetype: "image/jpeg" });

		expect(await getPfpLocation(userId)).toBe(HashSHA256(JPEG_BUFFER));
	});

	it("does not update other users' custom_pfp_location", async () => {
		const other = await seedUser({ username: "other_user" });
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await ACTION_ChangePfp(taker, { "!fileBuffer": JPEG_BUFFER, fileMimetype: "image/jpeg" });

		expect(await getPfpLocation(other.id)).toBeNull();
	});

	it("does not update custom_pfp_location on a bad mimetype", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await expect(
			ACTION_ChangePfp(taker, { "!fileBuffer": BAD_BUFFER, fileMimetype: "image/webp" }),
		).rejects.toThrow();

		expect(await getPfpLocation(userId)).toBeNull();
	});

	// ── CDN calls ─────────────────────────────────────────────────────────────

	it("calls CDNStoreOrOverwrite with the correct URL and buffer", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await ACTION_ChangePfp(taker, { "!fileBuffer": JPEG_BUFFER, fileMimetype: "image/jpeg" });

		expect(CDNStoreOrOverwrite).toHaveBeenCalledOnce();
		expect(CDNStoreOrOverwrite).toHaveBeenCalledWith(
			GetProfilePictureURL(userId, HashSHA256(JPEG_BUFFER)),
			JPEG_BUFFER,
		);
	});

	// ── Audit log ─────────────────────────────────────────────────────────────

	it("writes a GOOD action row on success", async () => {
		const taker = { ip: "10.0.0.1", acct: { id: userId, username } };

		await ACTION_ChangePfp(taker, { "!fileBuffer": JPEG_BUFFER, fileMimetype: "image/jpeg" });

		const action = await DB.selectFrom("action")
			.selectAll()
			.where("kind", "=", "CHANGE_PFP")
			.executeTakeFirstOrThrow();

		expect(action).toMatchObject({
			kind: "CHANGE_PFP",
			result: "GOOD",
			ip: "10.0.0.1",
			user_id: userId,
		});
	});

	it("writes a BAD action row on invalid mimetype", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await expect(
			ACTION_ChangePfp(taker, { "!fileBuffer": BAD_BUFFER, fileMimetype: "image/webp" }),
		).rejects.toThrow();

		const action = await DB.selectFrom("action")
			.select("result")
			.where("kind", "=", "CHANGE_PFP")
			.executeTakeFirstOrThrow();

		expect(action.result).toBe("BAD");
	});

	it("does not store the file buffer content in the audit log input", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await ACTION_ChangePfp(taker, { "!fileBuffer": JPEG_BUFFER, fileMimetype: "image/jpeg" });

		const action = await DB.selectFrom("action")
			.select("input")
			.where("kind", "=", "CHANGE_PFP")
			.executeTakeFirstOrThrow();

		expect(JSON.stringify(action.input)).not.toContain(JPEG_BUFFER.toString("base64"));
	});
});

// ─── ACTION_DeletePfp ─────────────────────────────────────────────────────────

describe("ACTION_DeletePfp", () => {
	let userId: number;
	let username: string;

	beforeEach(async () => {
		vi.clearAllMocks();
		({ id: userId, username } = await seedUser({ username: "test_user" }));
	});

	// ── 404 guard ─────────────────────────────────────────────────────────────

	it("throws 404 when the user has no custom pfp", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await expect(ACTION_DeletePfp(taker, {})).rejects.toMatchObject({ code: 404 });
	});

	it("writes a BAD action row when the user has no custom pfp", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await expect(ACTION_DeletePfp(taker, {})).rejects.toThrow();

		const action = await DB.selectFrom("action")
			.select("result")
			.where("kind", "=", "DELETE_PFP")
			.executeTakeFirstOrThrow();

		expect(action.result).toBe("BAD");
	});

	// ── Success path ──────────────────────────────────────────────────────────

	it("returns {} on success", async () => {
		await seedUserWithPfp(userId, "existinghash");
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		const result = await ACTION_DeletePfp(taker, {});

		expect(result).toEqual({});
	});

	it("clears custom_pfp_location to null in the DB", async () => {
		await seedUserWithPfp(userId, "existinghash");
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await ACTION_DeletePfp(taker, {});

		expect(await getPfpLocation(userId)).toBeNull();
	});

	it("does not touch other users' custom_pfp_location", async () => {
		const other = await seedUser({ username: "other_user" });
		await seedUserWithPfp(other.id, "otherhash");
		await seedUserWithPfp(userId, "myhash");

		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await ACTION_DeletePfp(taker, {});

		expect(await getPfpLocation(other.id)).toBe("otherhash");
	});

	// ── CDN calls ─────────────────────────────────────────────────────────────

	it("calls CDNDelete once with the correct URL", async () => {
		await seedUserWithPfp(userId, "existinghash");
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await ACTION_DeletePfp(taker, {});

		expect(CDNDelete).toHaveBeenCalledOnce();
		expect(CDNDelete).toHaveBeenCalledWith(GetProfilePictureURL(userId, "existinghash"));
	});

	// ── Audit log ─────────────────────────────────────────────────────────────

	it("writes a GOOD action row on success", async () => {
		await seedUserWithPfp(userId, "existinghash");
		const taker = { ip: "10.0.0.1", acct: { id: userId, username } };

		await ACTION_DeletePfp(taker, {});

		const action = await DB.selectFrom("action")
			.selectAll()
			.where("kind", "=", "DELETE_PFP")
			.executeTakeFirstOrThrow();

		expect(action).toMatchObject({
			kind: "DELETE_PFP",
			result: "GOOD",
			ip: "10.0.0.1",
			user_id: userId,
		});
	});
});

// ─── ACTION_ChangeBanner ──────────────────────────────────────────────────────

describe("ACTION_ChangeBanner", () => {
	let userId: number;
	let username: string;

	beforeEach(async () => {
		vi.clearAllMocks();
		({ id: userId, username } = await seedUser({ username: "test_user" }));
	});

	// ── Mimetype validation ───────────────────────────────────────────────────

	it("returns { contentHash } for a JPEG file", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		const result = await ACTION_ChangeBanner(taker, {
			"!fileBuffer": JPEG_BUFFER,
			fileMimetype: "image/jpeg",
		});

		expect(result).toMatchObject({ contentHash: HashSHA256(JPEG_BUFFER) });
	});

	it("returns { contentHash } for a PNG file", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		const result = await ACTION_ChangeBanner(taker, {
			"!fileBuffer": PNG_BUFFER,
			fileMimetype: "image/png",
		});

		expect(result).toMatchObject({ contentHash: HashSHA256(PNG_BUFFER) });
	});

	it("returns { contentHash } for a GIF file", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		const result = await ACTION_ChangeBanner(taker, {
			"!fileBuffer": GIF_BUFFER,
			fileMimetype: "image/gif",
		});

		expect(result).toMatchObject({ contentHash: HashSHA256(GIF_BUFFER) });
	});

	it("throws 400 for an unsupported mimetype", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await expect(
			ACTION_ChangeBanner(taker, { "!fileBuffer": BAD_BUFFER, fileMimetype: "image/webp" }),
		).rejects.toMatchObject({ code: 400 });
	});

	// ── Database updates ──────────────────────────────────────────────────────

	it("persists the content hash to custom_banner_location", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await ACTION_ChangeBanner(taker, {
			"!fileBuffer": JPEG_BUFFER,
			fileMimetype: "image/jpeg",
		});

		expect(await getBannerLocation(userId)).toBe(HashSHA256(JPEG_BUFFER));
	});

	it("does not update other users' custom_banner_location", async () => {
		const other = await seedUser({ username: "other_user" });
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await ACTION_ChangeBanner(taker, {
			"!fileBuffer": JPEG_BUFFER,
			fileMimetype: "image/jpeg",
		});

		expect(await getBannerLocation(other.id)).toBeNull();
	});

	it("does not update custom_banner_location on a bad mimetype", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await expect(
			ACTION_ChangeBanner(taker, { "!fileBuffer": BAD_BUFFER, fileMimetype: "image/webp" }),
		).rejects.toThrow();

		expect(await getBannerLocation(userId)).toBeNull();
	});

	// ── CDN calls ─────────────────────────────────────────────────────────────

	it("calls CDNStoreOrOverwrite with the correct URL and buffer", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await ACTION_ChangeBanner(taker, {
			"!fileBuffer": JPEG_BUFFER,
			fileMimetype: "image/jpeg",
		});

		expect(CDNStoreOrOverwrite).toHaveBeenCalledOnce();
		expect(CDNStoreOrOverwrite).toHaveBeenCalledWith(
			GetProfileBannerURL(userId, HashSHA256(JPEG_BUFFER)),
			JPEG_BUFFER,
		);
	});

	// ── Audit log ─────────────────────────────────────────────────────────────

	it("writes a GOOD action row on success", async () => {
		const taker = { ip: "10.0.0.1", acct: { id: userId, username } };

		await ACTION_ChangeBanner(taker, {
			"!fileBuffer": JPEG_BUFFER,
			fileMimetype: "image/jpeg",
		});

		const action = await DB.selectFrom("action")
			.selectAll()
			.where("kind", "=", "CHANGE_BANNER")
			.executeTakeFirstOrThrow();

		expect(action).toMatchObject({
			kind: "CHANGE_BANNER",
			result: "GOOD",
			ip: "10.0.0.1",
			user_id: userId,
		});
	});

	it("writes a BAD action row on invalid mimetype", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await expect(
			ACTION_ChangeBanner(taker, { "!fileBuffer": BAD_BUFFER, fileMimetype: "image/webp" }),
		).rejects.toThrow();

		const action = await DB.selectFrom("action")
			.select("result")
			.where("kind", "=", "CHANGE_BANNER")
			.executeTakeFirstOrThrow();

		expect(action.result).toBe("BAD");
	});

	it("does not store the file buffer content in the audit log input", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await ACTION_ChangeBanner(taker, {
			"!fileBuffer": JPEG_BUFFER,
			fileMimetype: "image/jpeg",
		});

		const action = await DB.selectFrom("action")
			.select("input")
			.where("kind", "=", "CHANGE_BANNER")
			.executeTakeFirstOrThrow();

		expect(JSON.stringify(action.input)).not.toContain(JPEG_BUFFER.toString("base64"));
	});
});

// ─── ACTION_DeleteBanner ──────────────────────────────────────────────────────

describe("ACTION_DeleteBanner", () => {
	let userId: number;
	let username: string;

	beforeEach(async () => {
		vi.clearAllMocks();
		({ id: userId, username } = await seedUser({ username: "test_user" }));
	});

	// ── 404 guard ─────────────────────────────────────────────────────────────

	it("throws 404 when the user has no custom banner", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await expect(ACTION_DeleteBanner(taker, {})).rejects.toMatchObject({ code: 404 });
	});

	it("writes a BAD action row when the user has no custom banner", async () => {
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await expect(ACTION_DeleteBanner(taker, {})).rejects.toThrow();

		const action = await DB.selectFrom("action")
			.select("result")
			.where("kind", "=", "DELETE_BANNER")
			.executeTakeFirstOrThrow();

		expect(action.result).toBe("BAD");
	});

	// ── Success path ──────────────────────────────────────────────────────────

	it("returns {} on success", async () => {
		await seedUserWithBanner(userId, "existinghash");
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		const result = await ACTION_DeleteBanner(taker, {});

		expect(result).toEqual({});
	});

	it("clears custom_banner_location to null in the DB", async () => {
		await seedUserWithBanner(userId, "existinghash");
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await ACTION_DeleteBanner(taker, {});

		expect(await getBannerLocation(userId)).toBeNull();
	});

	it("does not touch other users' custom_banner_location", async () => {
		const other = await seedUser({ username: "other_user" });
		await seedUserWithBanner(other.id, "otherhash");
		await seedUserWithBanner(userId, "myhash");

		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await ACTION_DeleteBanner(taker, {});

		expect(await getBannerLocation(other.id)).toBe("otherhash");
	});

	// ── CDN calls ─────────────────────────────────────────────────────────────

	it("calls CDNDelete once with the correct URL", async () => {
		await seedUserWithBanner(userId, "existinghash");
		const taker = { ip: "127.0.0.1", acct: { id: userId, username } };

		await ACTION_DeleteBanner(taker, {});

		expect(CDNDelete).toHaveBeenCalledOnce();
		expect(CDNDelete).toHaveBeenCalledWith(GetProfileBannerURL(userId, "existinghash"));
	});

	// ── Audit log ─────────────────────────────────────────────────────────────

	it("writes a GOOD action row on success", async () => {
		await seedUserWithBanner(userId, "existinghash");
		const taker = { ip: "10.0.0.1", acct: { id: userId, username } };

		await ACTION_DeleteBanner(taker, {});

		const action = await DB.selectFrom("action")
			.selectAll()
			.where("kind", "=", "DELETE_BANNER")
			.executeTakeFirstOrThrow();

		expect(action).toMatchObject({
			kind: "DELETE_BANNER",
			result: "GOOD",
			ip: "10.0.0.1",
			user_id: userId,
		});
	});
});
