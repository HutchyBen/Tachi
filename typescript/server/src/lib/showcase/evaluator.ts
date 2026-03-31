import { LoadPbByUserAndChartID } from "#lib/db-formats/pb";
import DB from "#services/pg/db";
import { GetFolderChartIDs } from "#utils/folder";
import { sql } from "kysely";
import {
	GetGPTConfig,
	type GPTString,
	type integer,
	type ShowcaseStatChart,
	type ShowcaseStatDetails,
	type ShowcaseStatFolder,
} from "tachi-common";

export function EvaluateShowcaseStat(
	gpt: GPTString,
	details: ShowcaseStatDetails,
	userID: integer,
): Promise<{
	outOf?: number;
	value: number | null;
}> {
	switch (details.mode) {
		case "chart":
			return EvaluateShowcaseChartStat(gpt, details, userID);
		case "folder":
			return EvaluateShowcaseFolderStat(gpt, details, userID);

		default:
			// @ts-expect-error This should never happen anyway -- this ignore ignores a 'never' result.
			throw new Error(`Invalid mode of ${details.mode} as details mode?`);
	}
}

async function EvaluateShowcaseChartStat(
	gpt: GPTString,
	details: ShowcaseStatChart,
	userID: integer,
) {
	// requires special handling
	if (details.metric === "playcount") {
		const row = await DB.selectFrom("score")
			.innerJoin("chart", "chart.id", "score.chart_id")
			.select((eb) => eb.fn.countAll<number>().as("cnt"))
			.where("score.user_id", "=", userID)
			.where("chart.id", "=", details.chartID)
			.executeTakeFirst();

		return { value: Number(row?.cnt ?? 0) };
	}

	const pb = await LoadPbByUserAndChartID(userID, details.chartID);

	if (!pb) {
		return { value: null };
	}

	const metric = details.metric;

	const gptConfig = GetGPTConfig(gpt);

	const scoreMetricConfig = gptConfig.providedMetrics[metric] ?? gptConfig.derivedMetrics[metric];

	if (!scoreMetricConfig) {
		throw new Error(`Invalid metric of ${metric} passed for game ${gpt}.`);
	}

	if (scoreMetricConfig.type === "ENUM") {
		// @ts-expect-error guaranteed to be correct
		return { value: pb.scoreData.enumIndexes[metric] };
	}

	// @ts-expect-error guaranteed to be correct
	return { value: pb.scoreData[metric] };
}

async function EvaluateShowcaseFolderStat(
	gpt: GPTString,
	details: ShowcaseStatFolder,
	userID: integer,
) {
	let chartIDs;

	if (Array.isArray(details.folderID)) {
		chartIDs = (await Promise.all(details.folderID.map((id) => GetFolderChartIDs(id)))).flat(1);
	} else {
		chartIDs = await GetFolderChartIDs(details.folderID);
	}

	const value = await CountPbsForFolderMetricGte(
		userID,
		chartIDs,
		gpt,
		details.metric,
		details.gte,
	);

	return { value, outOf: chartIDs.length };
}

async function CountPbsForFolderMetricGte(
	userID: integer,
	chartIDs: string[],
	gpt: GPTString,
	metric: string,
	gte: number,
): Promise<number> {
	if (chartIDs.length === 0) {
		return 0;
	}

	const gptConfig = GetGPTConfig(gpt);
	const scoreMetricConfig = gptConfig.providedMetrics[metric] ?? gptConfig.derivedMetrics[metric];

	if (!scoreMetricConfig) {
		throw new Error(`Invalid metric of ${metric} passed for game ${gpt}.`);
	}

	const jsonBlob =
		gptConfig.derivedMetrics[metric] !== undefined ? sql`pb.derived_data` : sql`pb.data`;

	const row = await DB.selectFrom("pb")
		.select(sql<number>`count(*)::int`.as("count"))
		.where("pb.user_id", "=", userID)
		.where("pb.chart_id", "in", chartIDs)
		.where(sql<boolean>`(${jsonBlob}::jsonb->>${sql.lit(metric)})::double precision >= ${gte}`)
		.executeTakeFirst();

	return row?.count ?? 0;
}
