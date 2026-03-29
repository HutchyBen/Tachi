import DB from "#services/pg/db";
import { seedUser } from "#test-utils/pg-fixtures";
import { describe, expect, it } from "vitest";

import { GetAdjacentAbove, GetAdjacentBelow } from "./pbs";

describe("GetAdjacentAbove / GetAdjacentBelow (Postgres)", () => {
	let n = 0;

	async function seedUscChartWithRankedPbs(
		chartLegacyId: string,
		rows: Array<{ rank: number; userId: number }>,
	) {
		const k = ++n;
		const songId = `song-pbs-${k}`;
		const chartId = `chart-pbs-${k}`;

		await DB.insertInto("song")
			.values({
				id: songId,
				legacy_id: 3_000_000 + k,
				game_group: "usc",
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
				legacy_id: chartLegacyId,
				game: "usc-controller",
				song_id: songId,
				level: "1",
				level_num: 1,
				is_primary: true,
				difficulty: "NOV",
				versions: [],
				data: JSON.stringify({}),
			})
			.execute();

		for (const r of rows) {
			// eslint-disable-next-line no-await-in-loop
			await DB.insertInto("pb")
				.values({
					calculated_data: JSON.stringify({ rank: r.rank }),
					chart_id: chartId,
					data: JSON.stringify({}),
					derived_data: JSON.stringify({}),
					lens: null,
					user_id: r.userId,
					ranking_value: 0,
					ranking_value_tb1: null,
					ranking_value_tb2: null,
					ranking_value_tb3: null,
					ranking_value_tb4: null,
					ranking_value_tb5: null,
					highlight: false,
					time_achieved: null,
				})
				.execute();
		}
	}

	const basePb = (chartLegacyId: string, rank: number) =>
		({
			chartID: chartLegacyId,
			rankingData: { outOf: 0, rank, rivalRank: null },
		}) as never;

	it("GetAdjacentAbove returns PBs with better rank (lower number)", async () => {
		const t = Date.now();
		const { id: u1 } = await seedUser({ username: `usc_a_${t}` });
		const { id: u2 } = await seedUser({ username: `usc_b_${t}` });
		const { id: u3 } = await seedUser({ username: `usc_c_${t}` });
		const legacy = `usc-adj-${t}`;

		await seedUscChartWithRankedPbs(legacy, [
			{ rank: 1, userId: u1 },
			{ rank: 2, userId: u2 },
			{ rank: 10, userId: u3 },
		]);

		const above = await GetAdjacentAbove(basePb(legacy, 5), 10);
		const ranks = above.map((p) => p.rankingData.rank).sort((a, b) => a - b);
		expect(ranks).toEqual([1, 2]);
	});

	it("GetAdjacentBelow returns PBs with worse rank (higher number)", async () => {
		const t = Date.now();
		const { id: u1 } = await seedUser({ username: `usc_d_${t}` });
		const { id: u2 } = await seedUser({ username: `usc_e_${t}` });
		const legacy = `usc-bel-${t}`;

		await seedUscChartWithRankedPbs(legacy, [
			{ rank: 8, userId: u1 },
			{ rank: 20, userId: u2 },
		]);

		const below = await GetAdjacentBelow(basePb(legacy, 5), 10);
		const ranks = below.map((p) => p.rankingData.rank).sort((a, b) => a - b);
		expect(ranks).toEqual([8, 20]);
	});
});
