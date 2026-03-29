import DB from "#services/pg/db";
import { seedUser } from "#test-utils/pg-fixtures";
import { describe, expect, it } from "vitest";

import {
	FilterChartsAndSongs,
	GetPBOnChart,
	GetScoreIDsFromComposed,
	GetServerRecordOnChart,
} from "./scores";

describe("FilterChartsAndSongs", () => {
	it("keeps only charts and songs referenced by scores", () => {
		const out = FilterChartsAndSongs(
			[
				{ chartID: "c1", songID: 1 } as never,
				{ chartID: "c2", songID: 2 } as never,
			],
			[
				{ chartID: "c1" } as never,
				{ chartID: "cX" } as never,
			],
			[
				{ id: 1 } as never,
				{ id: 9 } as never,
			],
		);

		expect(out.charts.map((c: { chartID: string }) => c.chartID)).toEqual(["c1"]);
		expect(out.songs.map((s: { id: number }) => s.id)).toEqual([1]);
	});
});

describe("GetScoreIDsFromComposed", () => {
	it("dedupes score IDs from composedFrom", () => {
		const ids = GetScoreIDsFromComposed({
			composedFrom: [
				{ name: "Primary", scoreID: "a" },
				{ name: "M1", scoreID: "b" },
				{ name: "M2", scoreID: "a" },
			],
		} as never);

		expect(ids.sort()).toEqual(["a", "b"]);
	});
});

describe("GetPBOnChart / GetServerRecordOnChart (Postgres)", () => {
	let n = 0;

	async function seedIidxChartWithPbs(opts: {
		chartLegacyId: string;
		pbs: Array<{ userId: number; ranking: number }>;
	}) {
		const k = ++n;
		const songId = `song-pbutil-${k}`;
		const chartId = `chart-pbutil-${k}`;

		await DB.insertInto("song")
			.values({
				id: songId,
				legacy_id: 8_000_000 + k,
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
				id: chartId,
				legacy_id: opts.chartLegacyId,
				game: "iidx-sp",
				song_id: songId,
				level: "10",
				level_num: 10,
				is_primary: true,
				difficulty: "NORMAL",
				versions: [],
				data: JSON.stringify({}),
			})
			.execute();

		for (const p of opts.pbs) {
			// eslint-disable-next-line no-await-in-loop
			await DB.insertInto("pb")
				.values({
					user_id: p.userId,
					chart_id: chartId,
					lens: null,
					data: JSON.stringify({}),
					derived_data: JSON.stringify({}),
					calculated_data: JSON.stringify({ rank: 1 }),
					ranking_value: p.ranking,
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

		return { chartId };
	}

	it("GetPBOnChart returns PB for user + legacy chart id", async () => {
		const { id: u1 } = await seedUser();
		const legacy = `leg-pb-${Date.now()}`;
		await seedIidxChartWithPbs({
			chartLegacyId: legacy,
			pbs: [{ userId: u1, ranking: 100 }],
		});

		const pb = await GetPBOnChart(u1, legacy);
		expect(pb).not.toBeNull();
		expect(pb?.chartID).toBe(legacy);
		expect(pb?.userID).toBe(u1);
	});

	it("GetServerRecordOnChart picks highest ranking_value on chart", async () => {
		const t = Date.now();
		const { id: low } = await seedUser({ username: `pb_low_${t}` });
		const { id: high } = await seedUser({ username: `pb_high_${t}` });
		const legacy = `leg-sr-${Date.now()}`;
		await seedIidxChartWithPbs({
			chartLegacyId: legacy,
			pbs: [
				{ userId: low, ranking: 10 },
				{ userId: high, ranking: 99.5 },
			],
		});

		const pb = await GetServerRecordOnChart(legacy);
		expect(pb).not.toBeNull();
		expect(pb?.userID).toBe(high);
		expect(pb?.rankingData.rank).toBe(1);
	});
});
