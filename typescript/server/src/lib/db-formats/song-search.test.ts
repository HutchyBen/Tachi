import { SearchSpecificGameSongs } from "#lib/search/search";
import DB from "#services/pg/db";
import { importSeedsSubset } from "#services/pg/seeds";
import { resolveSeedsDir, seedsJsonAvailable } from "#test-utils/seed-paths";
import { sql } from "kysely";
import { describe, expect, it } from "vitest";

import {
	LoadSongChildrenForPgIds,
	MAX_SONG_SEARCH_RESULTS_PER_GAME,
	SearchSongsForGameFtsAndTrgm,
} from "./song-search";

function makeSongId(n: number): string {
	return `S${n.toString(16).padStart(20, "0")}`;
}

async function countSongRows(): Promise<number> {
	const { rows } = await sql<{ c: bigint }>`
		SELECT count(*)::bigint AS c FROM song
	`.execute(DB);

	return Number(rows[0]?.c ?? 0);
}

/**
 * Strings that would be dangerous if concatenated into SQL as raw text.
 * Kysely `sql`…`${value}` binds values as parameters, so these must not execute as SQL.
 */
const HOSTILE_SEARCH_PAYLOADS = [
	"'; DROP TABLE song; --",
	"1' OR '1'='1",
	"1; DELETE FROM song WHERE 1=1;--",
	"' OR 1=1--",
	"') OR ('a'='a",
	"\\'; SELECT pg_sleep(10);--",
	'" UNION SELECT * FROM account--',
];

describe("SearchSongsForGameFtsAndTrgm (synthetic rows)", () => {
	it("returns no rows for empty or whitespace search", async () => {
		await DB.insertInto("song")
			.values({
				id: makeSongId(1),
				legacy_id: 9_000_001,
				game_group: "iidx",
				title: "Empty Query Test",
				artist: "X",
				fts_document: "",
				data: JSON.stringify({}),
			})
			.execute();

		expect(await SearchSongsForGameFtsAndTrgm("iidx", "", 10)).toEqual([]);
		expect(await SearchSongsForGameFtsAndTrgm("iidx", "   ", 10)).toEqual([]);
	});

	it("matches FTS on title and respects game_group", async () => {
		await DB.insertInto("song")
			.values([
				{
					id: makeSongId(2),
					legacy_id: 9_000_002,
					game_group: "iidx",
					title: "UniqueAlphaToken",
					artist: "Artist A",
					fts_document: "",
					data: JSON.stringify({}),
				},
				{
					id: makeSongId(3),
					legacy_id: 9_000_003,
					game_group: "sdvx",
					title: "UniqueAlphaToken Other Game",
					artist: "Artist B",
					fts_document: "",
					data: JSON.stringify({}),
				},
			])
			.execute();

		const iidx = await SearchSongsForGameFtsAndTrgm("iidx", "UniqueAlphaToken", 10);

		expect(iidx).toHaveLength(1);
		expect(iidx[0]?.legacy_id).toBe(9_000_002);
	});

	it("loads search terms and alt titles via LoadSongChildrenForPgIds", async () => {
		const sid = makeSongId(4);

		await DB.insertInto("song")
			.values({
				id: sid,
				legacy_id: 9_000_004,
				game_group: "iidx",
				title: "Child Row Test",
				artist: "Z",
				fts_document: "synonym extra",
				data: JSON.stringify({}),
			})
			.execute();

		await DB.insertInto("song_search_term")
			.values({ song_id: sid, search_term: "synonym" })
			.execute();
		await DB.insertInto("song_alt_title")
			.values({ song_id: sid, alt_title: "Extra JP" })
			.execute();

		const rows = await SearchSongsForGameFtsAndTrgm("iidx", "Child", 10);
		const children = await LoadSongChildrenForPgIds(rows.map((r) => r.id));

		expect(children.get(sid)).toEqual({
			searchTerms: ["synonym"],
			altTitles: ["Extra JP"],
		});
	});

	it("caps results at MAX_SONG_SEARCH_RESULTS_PER_GAME even when limit is higher", async () => {
		const rows = Array.from({ length: 150 }, (_, i) => ({
			id: makeSongId(100 + i),
			legacy_id: 9_100_000 + i,
			game_group: "iidx" as const,
			title: `CapBulk ${i}`,
			artist: "Cap Artist",
			fts_document: "",
			data: JSON.stringify({}),
		}));

		await DB.insertInto("song").values(rows).execute();

		const res = await SearchSongsForGameFtsAndTrgm("iidx", "CapBulk", 500);

		expect(res.length).toBe(MAX_SONG_SEARCH_RESULTS_PER_GAME);
	});

	it("uses trgm / short-query path for very short queries", async () => {
		await DB.insertInto("song")
			.values({
				id: makeSongId(300),
				legacy_id: 9_000_300,
				game_group: "iidx",
				title: "Qx",
				artist: "ShortQ Artist",
				fts_document: "",
				data: JSON.stringify({}),
			})
			.execute();

		const res = await SearchSongsForGameFtsAndTrgm("iidx", "Qx", 10);

		expect(res.some((r) => r.legacy_id === 9_000_300)).toBe(true);
	});
});

describe("SearchSongsForGameFtsAndTrgm (hostile / injection-shaped input)", () => {
	it("does not change song row count when search strings look like SQL injection", async () => {
		await DB.insertInto("song")
			.values([
				{
					id: makeSongId(400),
					legacy_id: 9_000_400,
					game_group: "iidx",
					title: "Bait Song",
					artist: "Bait",
					fts_document: "",
					data: JSON.stringify({}),
				},
				{
					id: makeSongId(401),
					legacy_id: 9_000_401,
					game_group: "iidx",
					title: "Other Bait",
					artist: "Bait",
					fts_document: "",
					data: JSON.stringify({}),
				},
			])
			.execute();

		const before = await countSongRows();

		await Promise.all(
			HOSTILE_SEARCH_PAYLOADS.map(async (payload) => {
				await SearchSongsForGameFtsAndTrgm("iidx", payload, 10);
				expect(await countSongRows()).toBe(before);
			}),
		);
	});

	it("does not change row count via SearchSpecificGameSongs with the same payloads", async () => {
		const before = await countSongRows();

		await Promise.all(
			HOSTILE_SEARCH_PAYLOADS.map(async (payload) => {
				await SearchSpecificGameSongs("iidx", payload, 10);
				expect(await countSongRows()).toBe(before);
			}),
		);
	});

	it("rejects NUL in search string (PostgreSQL UTF-8 text; not SQL injection)", async () => {
		await DB.insertInto("song")
			.values({
				id: makeSongId(600),
				legacy_id: 9_000_600,
				game_group: "iidx",
				title: "NulProbe",
				artist: "X",
				fts_document: "",
				data: JSON.stringify({}),
			})
			.execute();

		const before = await countSongRows();

		// TODO(zk): Throwing on nulbytes in strings is spicy
		// but we can't fix this, so whatever.
		await expect(SearchSongsForGameFtsAndTrgm("iidx", "a\x00b", 10)).rejects.toThrow(
			/UTF8|invalid byte sequence|0x00/iu,
		);

		expect(await countSongRows()).toBe(before);
	});

	it("treats ILIKE metacharacters in the search string as literals (no broad % / _ wildcard match)", async () => {
		await DB.insertInto("song")
			.values([
				{
					id: makeSongId(500),
					legacy_id: 9_000_500,
					game_group: "iidx",
					title: "ExactPercent",
					artist: "NoWildcard",
					fts_document: "",
					data: JSON.stringify({}),
				},
				{
					id: makeSongId(501),
					legacy_id: 9_000_501,
					game_group: "iidx",
					title: "Something Else Entirely",
					artist: "NoWildcard",
					fts_document: "",
					data: JSON.stringify({}),
				},
			])
			.execute();

		const pct = await SearchSongsForGameFtsAndTrgm("iidx", "%", 10);
		const titles = pct.map((r) => r.title);

		expect(titles).not.toContain("Something Else Entirely");
	});
});

describe("SearchSpecificGameSongs", () => {
	it("returns __textScore and song document fields", async () => {
		await DB.insertInto("song")
			.values({
				id: makeSongId(5),
				legacy_id: 9_000_005,
				game_group: "iidx",
				title: "ScoreFieldTest",
				artist: "Z",
				fts_document: "",
				data: JSON.stringify({ displayVersion: "1" }),
			})
			.execute();

		const songs = await SearchSpecificGameSongs("iidx", "ScoreFieldTest", 10);

		expect(songs).toHaveLength(1);
		expect(songs[0]?.title).toBe("ScoreFieldTest");
		expect(typeof songs[0]?.__textScore).toBe("number");
	});
});

describe("SearchSongsForGameFtsAndTrgm (real seed subset)", () => {
	it.skipIf(!seedsJsonAvailable())(
		"finds known IIDX titles from a small songs-iidx slice",
		async () => {
			await importSeedsSubset(DB, resolveSeedsDir(), {
				gameGroups: ["iidx"],
				maxSongsPerGame: 80,
				includeCharts: false,
			});

			const gradius = await SearchSongsForGameFtsAndTrgm("iidx", "GRADIUSIC CYBER", 20);

			expect(gradius.some((r) => r.title === "GRADIUSIC CYBER")).toBe(true);

			const prince = await SearchSongsForGameFtsAndTrgm("iidx", "Prince on a star", 20);

			expect(prince.some((r) => r.title === "Prince on a star")).toBe(true);
		},
	);
});
