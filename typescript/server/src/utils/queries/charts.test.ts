import DB from "#services/pg/db";
import { describe, expect, it } from "vitest";

import { FindChartWithChartID } from "./charts";

describe("FindChartWithChartID (Postgres)", () => {
	it("finds chart by Postgres id", async () => {
		const suffix = `${Date.now()}`;
		const chartId = `chart-fc-${suffix}`;
		const songId = `song-fc-${suffix}`;

		await DB.insertInto("song")
			.values({
				id: songId,
				legacy_id: 5_100_000,
				game_group: "ddr",
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
				id: chartId,
				legacy_id: `legacy-${suffix}`,
				game: "ddr-sp",
				song_id: songId,
				level: "10",
				level_num: 10,
				is_primary: true,
				difficulty: "EXPERT",
				versions: [],
				data: JSON.stringify({}),
			})
			.execute();

		const doc = await FindChartWithChartID("ddr", chartId);
		expect(doc).not.toBeNull();
		expect(doc?.chartID).toBe(chartId);
		expect(doc?.songID).toBe(5_100_000);
	});

	it("returns null when missing", async () => {
		expect(await FindChartWithChartID("popn", "no-such-chart")).toBeNull();
	});
});
