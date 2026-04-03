/* eslint-disable no-await-in-loop */
import type { Difficulties, integer, MONGO_ChartDocument, Playtypes } from "tachi-common";

import { MakeAction } from "#lib/actions/actions";
import { log } from "#lib/log/log";
import DB from "#services/pg/db";
import { RecalcAllScores } from "#utils/calculations/recalc-scores";
import fetch from "#utils/fetch";
import { FindChartWithPTDFVersion } from "#utils/queries/charts";
import { FindSongOnTitle } from "#utils/queries/songs";
import { IsUserAdmin } from "#utils/user";
import { ExpectedErr } from "bliss";

const difficultyResolve: Record<string, [Playtypes["iidx"], Difficulties["iidx:DP" | "iidx:SP"]]> =
	{
		3: ["SP", "HYPER"],
		4: ["SP", "ANOTHER"],
		8: ["DP", "HYPER"],
		9: ["DP", "ANOTHER"],
		10: ["SP", "LEGGENDARIA"],
		11: ["DP", "LEGGENDARIA"],
	};

interface PoyashiProxyBPIInfo {
	title: string;
	difficulty: string;
	wr: integer;
	avg: integer;
	notes: string;
	bpm: string;
	textage: string;
	difficultyLevel: string;
	dpLevel: string;
	coef?: number | string | null;
	removed?: boolean;
}

interface PoyashiProxyData {
	version: integer;
	requireVersion: string;
	body: Array<PoyashiProxyBPIInfo>;
}

/**
 * Fetches Poyashi BPI's latest information and writes BPI coefficients / WR / kaiden avg
 * to Postgres `chart.data` for IIDX charts (version 29).
 */
export async function updateBpiDataCore() {
	log.info("Fetching data from proxy...");
	const data = (await fetch("https://proxy.poyashi.me/?type=bpi").then((r) =>
		r.json(),
	)) as PoyashiProxyData;

	log.info("Fetched data.");
	const updatedChartIDs: Array<string> = [];

	for (const d of data.body) {
		const res: ["DP" | "SP", Difficulties["iidx:DP" | "iidx:SP"]] | undefined =
			difficultyResolve[d.difficulty];

		if (!res) {
			throw new Error(`Unknown difficulty ${d.difficulty}`);
		}

		const [playtype, diff] = res;

		const tachiSong = await FindSongOnTitle("iidx", d.title);

		if (!tachiSong) {
			log.warn(`Cannot find song ${d.title}?`);
			continue;
		}

		const tachiChart = await FindChartWithPTDFVersion(
			"iidx",
			tachiSong.id,
			playtype,
			diff,
			"29",
		);

		if (!tachiChart) {
			log.warn(
				`Cannot find chart ${tachiSong.title} (${tachiSong.id}) ${playtype}, ${diff}?`,
			);
			continue;
		}

		const kavg = Number(d.avg);

		if (kavg < 0) {
			log.warn(`${tachiSong.title} (${playtype} ${diff}). Invalid kavg ${d.avg}, Skipping.`);
			continue;
		}

		if (d.removed === true) {
			log.info(`Skipping removed chart ${tachiSong.title}.`);
			continue;
		}

		const newCoef = Number(d.coef) === -1 || d.coef === undefined ? null : Number(d.coef);
		const newKavg = Number(d.avg);
		const newWR = Number(d.wr);

		const iidxChart = tachiChart as
			| MONGO_ChartDocument<"iidx:DP">
			| MONGO_ChartDocument<"iidx:SP">;

		if (
			iidxChart.data.bpiCoefficient !== newCoef ||
			iidxChart.data.kaidenAverage !== newKavg ||
			iidxChart.data.worldRecord !== newWR
		) {
			updatedChartIDs.push(tachiChart.chartID);

			const mergedData = {
				...iidxChart.data,
				bpiCoefficient: newCoef,
				kaidenAverage: newKavg,
				worldRecord: newWR,
			};

			await DB.updateTable("chart")
				.set({ data: mergedData as object })
				.where("id", "=", tachiChart.chartID)
				.execute();
		}
	}

	if (updatedChartIDs.length !== 0) {
		log.info(`Finished applying BPI changes in Postgres. Recalcing scores.`);
		// TODO(zk): We don't want to recalc _everything_ on changes like this?
		await RecalcAllScores();
		log.info(`Finished recalcing scores.`);
	}

	return { chartsUpdated: updatedChartIDs.length };
}

export const ACTION_UpdateBpiData = MakeAction("UPDATE_BPI_DATA", async (taker, _input) => {
	if (!(await IsUserAdmin(taker.acct.id))) {
		throw new ExpectedErr(403, "You are not authorized to perform this action.");
	}

	return updateBpiDataCore();
});
