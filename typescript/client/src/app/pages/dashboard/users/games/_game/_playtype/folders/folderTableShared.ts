import type { FolderStatsInfo, TableEvolutionEventAPI } from "#types/api-returns";

import {
	type FolderDocument,
	type GameConfig,
	GetScoreMetricConf,
	type integer,
	type TableDocument,
	type UserDocument,
	type V3Game,
} from "tachi-common";

export type FolderTableScopedProps = {
	game: V3Game;
	reqUser: UserDocument;
};

export interface UGPTFolderStats {
	folder: FolderDocument;
	stats: FolderStatsInfo;
}

/** API `table.folders` is ascending (e.g. Level 1 … 12); show highest folder / level first in chart + table. */
export function tableFolderSlugsDisplayOrder(table: TableDocument): string[] {
	return [...table.folders].reverse();
}

export function evoEventTimeMs(ev: TableEvolutionEventAPI): number {
	return ev.timeAchieved ?? ev.timeAdded;
}

export function buildEvolutionReplayFolderStats(opts: {
	enumMetric: string;
	eventsPrefix: TableEvolutionEventAPI[];
	folderChartIDs: Record<string, string[]>;
	folderSlug: string;
	gameConfig: GameConfig;
}): FolderStatsInfo {
	const chartIds = opts.folderChartIDs[opts.folderSlug] ?? [];

	const metricConf = GetScoreMetricConf(opts.gameConfig, opts.enumMetric);
	if (metricConf.type !== "ENUM") {
		return { slug: opts.folderSlug, chartCount: chartIds.length, stats: {} };
	}

	const peakByMetricByChart = new Map<string, Record<string, number>>();

	for (const ev of opts.eventsPrefix) {
		const forChart = peakByMetricByChart.get(ev.chartID) ?? {};
		forChart[ev.metric] = ev.enumIndex;
		peakByMetricByChart.set(ev.chartID, forChart);
	}

	const bucket: Record<string, integer> = {};

	for (const cid of chartIds) {
		const idx = peakByMetricByChart.get(cid)?.[opts.enumMetric];
		if (idx === undefined) {
			continue;
		}
		const lbl = metricConf.values[idx];
		if (!lbl) {
			continue;
		}
		bucket[lbl] = (bucket[lbl] ?? 0) + 1;
	}

	return {
		slug: opts.folderSlug,
		chartCount: chartIds.length,
		stats: { [opts.enumMetric]: bucket },
	};
}
