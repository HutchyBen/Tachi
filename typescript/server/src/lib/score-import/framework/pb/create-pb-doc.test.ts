import type { KtLogger } from "#lib/log/log";

import DB from "#services/pg/db";
import { seedUser } from "#test-utils/pg-fixtures";
import { Testing511Song, Testing511SPA } from "#test-utils/test-data";
import { describe, expect, it, vi } from "vitest";

import { CreatePBDoc } from "./create-pb-doc";

describe("CreatePBDoc", () => {
	it("returns undefined and logs when the user has no scores on the chart", async () => {
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

		const { id: userId } = await seedUser();

		const warn = vi.fn();
		const fakeLogger = { warn } as unknown as KtLogger;

		const res = await CreatePBDoc("iidx-sp", userId, Testing511SPA, fakeLogger);

		expect(res).toBeUndefined();
		expect(warn).toHaveBeenCalled();
	});
});
