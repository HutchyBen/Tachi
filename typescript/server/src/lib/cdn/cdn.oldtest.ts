import { Env, ServerConfig } from "#lib/setup/config";
import { expressRequestMock } from "#test-utils/mock-request";
import t from "tap";

import { CDNDelete, CDNRedirect, CDNRetrieve, CDNStoreOrOverwrite } from "./cdn";
import { DeleteAllCdnObjects } from "./s3";

async function ResetBucket() {
	if (Env.NODE_ENV !== "test") {
		throw new Error(
			`Not in test, yet CDN.oldtest.ts was triggered, which could wipe an S3 bucket.`,
		);
	}

	await DeleteAllCdnObjects();
}

t.test("#CDNRetrieve", (t) => {
	t.beforeEach(ResetBucket);

	t.test("Should retrieve the file at the given location.", async (t) => {
		await CDNStoreOrOverwrite("test.txt", "1");

		const data = await CDNRetrieve("test.txt");

		t.equal(data.toString(), "1", "Should contain the contents of test.txt");

		t.end();
	});

	t.test("Should throw if the file does not exist.", async (t) => {
		await t.rejects(CDNRetrieve("fake-file.txt"));

		t.end();
	});

	t.end();
});

t.test("#CDNStoreOrOverwrite", (t) => {
	t.beforeEach(ResetBucket);

	t.test("Should store a value.", async (t) => {
		await CDNStoreOrOverwrite("test.txt", "hello world");

		const data = (await CDNRetrieve("test.txt")).toString("utf8");

		t.equal(data, "hello world", "Should store the data in S3.");

		t.end();
	});

	t.test("Should generate paths on the way to the file if they do not exist.", async (t) => {
		await CDNStoreOrOverwrite("a/b/c/d/e/f/g.txt", "hello");

		const data = (await CDNRetrieve("a/b/c/d/e/f/g.txt")).toString("utf8");

		t.equal(data, "hello", "Should store the data at the deeply nested location.");

		t.end();
	});

	t.test("Should store a file if one doesn't exist", async (t) => {
		await CDNStoreOrOverwrite("test.txt", "1");

		t.equal((await CDNRetrieve("test.txt")).toString(), "1");

		t.end();
	});

	t.test("Should overwrite the file if it exists.", async (t) => {
		await CDNStoreOrOverwrite("test.txt", "1");
		t.equal((await CDNRetrieve("test.txt")).toString(), "1");

		await CDNStoreOrOverwrite("test.txt", "2");
		t.equal((await CDNRetrieve("test.txt")).toString(), "2");

		t.end();
	});

	t.end();
});

t.test("#CDNDelete", (t) => {
	t.beforeEach(ResetBucket);

	t.test("Should delete the file at the given location.", async (t) => {
		await CDNStoreOrOverwrite("test.txt", "1");

		t.equal((await CDNRetrieve("test.txt")).toString(), "1");

		await CDNDelete("test.txt");

		await t.rejects(CDNRetrieve("test.txt"));

		t.end();
	});

	t.end();
});

t.test("#CDNRedirect", (t) => {
	t.beforeEach(ResetBucket);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const mockMW = (req: any, res: any) => {
		CDNRedirect(res, "/test.txt");
	};

	t.test("Should redirect a user to the CDN Url", async (t) => {
		const { res } = await expressRequestMock(mockMW, {});

		t.equal(res.statusCode, 302);
		t.equal(res._getRedirectUrl(), `${ServerConfig.CDN_CONFIG.WEB_LOCATION}/test.txt`);

		t.end();
	});

	t.end();
});
