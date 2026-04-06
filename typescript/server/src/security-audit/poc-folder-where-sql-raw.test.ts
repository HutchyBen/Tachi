import { BuildFolderQuery } from "#lib/folders/folders.js";
import DB from "#services/pg/db";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

/**
 * POC for docs/security-audit-2026-04-05.md §2: `folder.where` is embedded with `sql.raw`.
 * A writer who can set `where` to a tautology affects which charts belong to the folder.
 *
 * This is not an unauthenticated network exploit — it requires DB write access to `folder`.
 */
describe("POC: tautological folder.where via sql.raw", () => {
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

	it("matches every chart in the game when where is always true", async () => {
		const { folderId, folderLegacy, songId, chartA, chartB } = ids("sqlraw");

		const songLegacy = 9_800_000 + Math.floor(Math.random() * 99_000);

		await DB.insertInto("song")
			.values({
				id: songId,
				legacy_id: songLegacy,
				game_group: "iidx",
				title: "POC Song",
				artist: "P",
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
				title: "POC tautology",
				slug: null,
				where: "true",
				version_filter: null,
				search_terms: [],
			})
			.execute();

		const { folderQuery } = await BuildFolderQuery(folderId);
		const { rows } = await folderQuery.execute(DB);

		const got = new Set(rows.map((r) => (r as { id: string }).id));

		// Both charts match — `where: "true"` is an unrestricted tautology.
		// A legitimate folder (e.g. `where: "chart.level_num = 10"`) would
		// return only chartB.  The tautology returns both.
		expect(got.has(chartA)).toBe(true);
		expect(got.has(chartB)).toBe(true);
		expect(rows.length).toBeGreaterThanOrEqual(2);
	});
});
