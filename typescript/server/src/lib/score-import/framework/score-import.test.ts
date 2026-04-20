import { seedUser } from "#actions/test-utils/api-tokens";
import { CDNRetrieve } from "#lib/cdn/cdn";
import { LoadImportDocumentById } from "#lib/db-formats/import-document";
import DB from "#services/pg/db";
import { FakeSmallBatchManual, Testing511Song, Testing511SPA } from "#test-utils/test-data";
import { Sleep } from "#utils/misc";
import { beforeEach, describe, expect, it } from "vitest";

import { MakeScoreImport } from "./score-import";

async function seed511Chart() {
	await DB.insertInto("song")
		.values({
			id: Testing511Song.id,
			legacy_id: 1,
			game_group: "iidx",
			title: Testing511Song.title,
			artist: Testing511Song.artist,
			search_terms: Testing511Song.searchTerms,
			alt_titles: Testing511Song.altTitles,
			data: Testing511Song.data,
			fts_document: "",
		})
		.execute();

	await DB.insertInto("chart")
		.values({
			id: Testing511SPA.chartID,
			legacy_id: Testing511SPA.chartID,
			game: "iidx-sp",
			song_id: Testing511Song.id,
			difficulty: Testing511SPA.difficulty,
			level: Testing511SPA.level,
			level_num: Testing511SPA.levelNum,
			is_primary: Testing511SPA.isPrimary,
			versions: Testing511SPA.versions,
			data: Testing511SPA.data,
		})
		.execute();
}

describe("MakeScoreImport (ported from score-import.oldtest.ts)", () => {
	beforeEach(async () => {
		await seedUser({
			username: "test_zkldi",
			email: "score-import-mks@example.com",
			withCredential: true,
			withSettings: true,
		});
		await seed511Chart();
	});

	it("imports BATCH-MANUAL and matches LoadImportDocumentById", async () => {
		const res = await MakeScoreImport({
			importID: "mockImportID",
			importType: "ir/direct-manual",
			parserArguments: [FakeSmallBatchManual, false],
			userID: 1,
			userIntent: true,
		});

		expect(res.importID).toBe("mockImportID");

		const dbRes = await LoadImportDocumentById("mockImportID");
		expect(dbRes).toBeDefined();
		expect(dbRes?.importID).toBe("mockImportID");

		const tracker = await DB.selectFrom("import_tracker")
			.select("import_id")
			.where("import_id", "=", "mockImportID")
			.executeTakeFirst();

		expect(tracker).toBeUndefined();

		expect(res).toEqual(dbRes);
	});

	it.skipIf(!process.env.TACHI_CDN_SAVE_LOCATION_BUCKET)(
		"stores import-input on CDN when TACHI_CDN_SAVE_LOCATION_BUCKET is set",
		async () => {
			await MakeScoreImport({
				importID: "mockImportID_cdn",
				importType: "ir/direct-manual",
				parserArguments: [FakeSmallBatchManual, false],
				userID: 1,
				userIntent: true,
			});

			await Sleep(800);

			const cdnRes = await CDNRetrieve("/score-import-input/mockImportID_cdn").then((r) =>
				JSON.parse(r.toString("utf-8")),
			);

			expect(cdnRes).toEqual([
				{
					meta: { game: "iidx", playtype: "SP", service: "foobar" },
					scores: [
						{
							score: 500,
							lamp: "HARD CLEAR",
							matchType: "songTitle",
							identifier: "5.1.1.",
							difficulty: "ANOTHER",
						},
					],
				},
				false,
			]);
		},
	);
});
