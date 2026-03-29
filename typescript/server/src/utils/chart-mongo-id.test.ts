import DB from "#services/pg/db";
import { describe, expect, it } from "vitest";

import { ResolveLegacyChartIdForMongo } from "./chart-mongo-id";

describe("ResolveLegacyChartIdForMongo", () => {
	it("resolves Postgres chart.id to Mongo legacy chart id string", async () => {
		const suffix = `${Date.now()}`;
		const pgChartId = `pg-chart-cmid-${suffix}`;
		const legacy = `legacy-cmid-${suffix}`;
		const songId = `song-cmid-${suffix}`;

		await DB.insertInto("song")
			.values({
				id: songId,
				legacy_id: 7_100_000,
				game_group: "iidx",
				title: "T",
				artist: "A",
				search_terms: [],
				alt_titles: [],
				data: JSON.stringify({}),
				fts_document: "",
			})
			.execute();

		await DB.insertInto("chart")
			.values({
				id: pgChartId,
				legacy_id: legacy,
				game: "iidx-sp",
				song_id: songId,
				level: "1",
				level_num: 1,
				is_primary: true,
				difficulty: "NORMAL",
				versions: [],
				data: JSON.stringify({}),
			})
			.execute();

		const resolved = await ResolveLegacyChartIdForMongo("iidx", "SP", pgChartId);
		expect(resolved).toBe(legacy);
	});

	it("resolves chart.legacy_id when passed as the param", async () => {
		const suffix = `${Date.now()}-b`;
		const pgChartId = `pg-chart-cmid-${suffix}`;
		const legacy = `legacy-cmid-${suffix}`;
		const songId = `song-cmid-${suffix}`;

		await DB.insertInto("song")
			.values({
				id: songId,
				legacy_id: 7_100_001,
				game_group: "iidx",
				title: "T",
				artist: "A",
				search_terms: [],
				alt_titles: [],
				data: JSON.stringify({}),
				fts_document: "",
			})
			.execute();

		await DB.insertInto("chart")
			.values({
				id: pgChartId,
				legacy_id: legacy,
				game: "iidx-sp",
				song_id: songId,
				level: "1",
				level_num: 1,
				is_primary: true,
				difficulty: "NORMAL",
				versions: [],
				data: JSON.stringify({}),
			})
			.execute();

		const resolved = await ResolveLegacyChartIdForMongo("iidx", "SP", legacy);
		expect(resolved).toBe(legacy);
	});

	it("returns null when chart does not exist", async () => {
		const resolved = await ResolveLegacyChartIdForMongo("iidx", "SP", "no-such-chart-id-xyz");
		expect(resolved).toBeNull();
	});
});
