import { BuildFolderQuery } from "#lib/folders/folders.js";
import DB from "#services/pg/db";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

/**
 * `BuildFolderQuery` loads `folder.query` and splices it into
 * `SELECT chart.id FROM chart WHERE <query>`, optionally AND-ing overlap on
 * `chart.versions` when `version_filter` is set. The column must hold a SQL
 * predicate (no leading `WHERE`), e.g. `chart.level_num = 10`.
 */
describe("BuildFolderQuery", () => {
	function ids(prefix: string) {
		const u = randomUUID().replace(/-/gu, "").slice(0, 12);

		return {
			folderId: `${prefix}-f-${u}`,
			folderLegacy: `${prefix}-fl-${u}`,
			songId: `${prefix}-s-${u}`,
			chartA: `${prefix}-ca-${u}`,
			chartB: `${prefix}-cb-${u}`,
		};
	}

	it("throws when the folder id does not exist", async () => {
		await expect(BuildFolderQuery("F_missing_folder_id")).rejects.toThrow(
			"Folder with ID 'F_missing_folder_id' not found.",
		);
	});

	it("fails at execute time when folder.query is not valid SQL (e.g. JSON, as in seeds.ts today)", async () => {
		const { folderId, folderLegacy } = ids("bfq0");

		await DB.insertInto("folder")
			.values({
				id: folderId,
				legacy_id: folderLegacy,
				game: "iidx-sp",
				inactive: false,
				title: "JSON query column",
				slug: null,
				query: JSON.stringify({ type: "charts", data: { level: "10" } }),
				version_filter: null,
				search_terms: [],
			})
			.execute();

		const { folderQuery } = await BuildFolderQuery(folderId);

		await expect(folderQuery.execute(DB)).rejects.toThrow();
	});

	it("returns chart rows that satisfy the stored SQL predicate", async () => {
		const { folderId, folderLegacy, songId, chartA, chartB } = ids("bfq1");

		await DB.insertInto("song")
			.values({
				id: songId,
				legacy_id: 9_800_001,
				game_group: "iidx",
				title: "BFQ Song",
				artist: "X",
				search_terms: [],
				alt_titles: [],
				fts_document: "",
				data: JSON.stringify({}),
			})
			.execute();

		await DB.insertInto("chart")
			.values([
				{
					id: chartA,
					legacy_id: chartA,
					game: "iidx-sp",
					song_id: songId,
					level: "9",
					level_num: 9,
					is_primary: true,
					difficulty: "ANOTHER",
					versions: [],
					data: JSON.stringify({}),
				},
				{
					id: chartB,
					legacy_id: chartB,
					game: "iidx-sp",
					song_id: songId,
					level: "10",
					level_num: 10,
					is_primary: true,
					difficulty: "HYPER",
					versions: [],
					data: JSON.stringify({}),
				},
			])
			.execute();

		await DB.insertInto("folder")
			.values({
				id: folderId,
				legacy_id: folderLegacy,
				game: "iidx-sp",
				inactive: false,
				title: "BFQ level 10 only",
				slug: null,
				query: "chart.level_num = 10",
				version_filter: null,
				search_terms: [],
			})
			.execute();

		const { folderQuery: built } = await BuildFolderQuery(folderId);
		const { rows } = await built.execute(DB);

		expect(rows).toHaveLength(1);
		expect((rows[0] as { id: string }).id).toBe(chartB);
	});

	it("with version_filter, requires overlapping chart.versions", async () => {
		const { folderId, folderLegacy, songId, chartA, chartB } = ids("bfq2");

		await DB.insertInto("song")
			.values({
				id: songId,
				legacy_id: 9_800_002,
				game_group: "iidx",
				title: "BFQ Song 2",
				artist: "Y",
				search_terms: [],
				alt_titles: [],
				fts_document: "",
				data: JSON.stringify({}),
			})
			.execute();

		// Both charts match the numeric predicate; only chartA lists version "epolis".
		await DB.insertInto("chart")
			.values([
				{
					id: chartA,
					legacy_id: chartA,
					game: "iidx-sp",
					song_id: songId,
					level: "10",
					level_num: 10,
					is_primary: true,
					difficulty: "ANOTHER",
					versions: ["epolis"],
					data: JSON.stringify({}),
				},
				{
					id: chartB,
					legacy_id: chartB,
					game: "iidx-sp",
					song_id: songId,
					level: "10",
					level_num: 10,
					is_primary: false,
					difficulty: "HYPER",
					versions: [],
					data: JSON.stringify({}),
				},
			])
			.execute();

		await DB.insertInto("folder")
			.values({
				id: folderId,
				legacy_id: folderLegacy,
				game: "iidx-sp",
				inactive: false,
				title: "Level 10 (EPOLIS)",
				slug: null,
				query: "chart.level_num = 10",
				version_filter: ["epolis"],
				search_terms: [],
			})
			.execute();

		const { folderQuery: built } = await BuildFolderQuery(folderId);
		const { rows } = await built.execute(DB);

		expect(rows).toHaveLength(1);
		expect((rows[0] as { id: string }).id).toBe(chartA);
	});
});
