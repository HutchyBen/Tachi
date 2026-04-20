import type { KtLogger } from "#lib/log/log";

import { GAME_IMPLEMENTATIONS } from "#game-implementations/game-implementations";
import { SELECT_CHART, ToChartDocument } from "#lib/db-formats/chart";
import {
	type ScoreDocumentJoinRow,
	SELECT_SCORE_DOCUMENT,
	ToScoreDocument,
} from "#lib/db-formats/score";
import { mongoScoreDataToPg } from "#lib/v3/migration-tools";
import DB from "#services/pg/db";

const BATCH_SIZE = 500;

/**
 * Re-derive `derived_data` and `calculated_data` for every score on the
 * given chart (by Postgres `chart.id`). This is called when chart data
 * changes in a way that affects score derivation (detected via
 * `derivation_checksum`).
 *
 * Each score UPDATE fires the `score_pb_dirty` trigger, so PB
 * recalculation is handled automatically.
 */
export async function rederiveScoresForChart(chartId: string, log: KtLogger): Promise<number> {
	const chartRow = await DB.selectFrom("chart")
		.innerJoin("song", "song.id", "chart.song_id")
		.select(SELECT_CHART)
		.where("chart.id", "=", chartId)
		.executeTakeFirst();

	if (!chartRow) {
		log.warn({ chartId }, "rederiveScoresForChart: chart not found, skipping.");
		return 0;
	}

	const chart = ToChartDocument(chartRow);
	const impl = GAME_IMPLEMENTATIONS[chart.game];

	let totalUpdated = 0;
	let offset = 0;

	while (true) {
		// eslint-disable-next-line no-await-in-loop
		const rows = await DB.selectFrom("score")
			.innerJoin("chart", "chart.id", "score.chart_id")
			.innerJoin("song", "song.id", "chart.song_id")
			.leftJoin("import", "import.id", "score.import_id")
			.select(SELECT_SCORE_DOCUMENT)
			.where("score.chart_id", "=", chartId)
			.orderBy("score.id", "asc")
			.limit(BATCH_SIZE)
			.offset(offset)
			.execute();

		if (rows.length === 0) {
			break;
		}

		for (const row of rows) {
			const score = ToScoreDocument(row as ScoreDocumentJoinRow);

			// GPT-specific union types aren't callable with the generic GPTString,
			// so we cast through `any` the same way CreateScoreCalcData does.
			const derivedData = (impl.scoreDeriver as any)(score.scoreData, chart);

			const newScoreData = {
				...score.scoreData,
				...derivedData,
			};

			const scoreCalcs = impl.scoreCalcs as any;
			const calculatedData = scoreCalcs(newScoreData, derivedData, chart);

			const { derived } = mongoScoreDataToPg(chart.game, newScoreData as any);

			// eslint-disable-next-line no-await-in-loop
			await DB.updateTable("score")
				.set({
					derived_data: JSON.stringify(derived),
					calculated_data: JSON.stringify(calculatedData),
				})
				.where("score.id", "=", score.scoreID)
				.execute();

			totalUpdated++;
		}

		offset += rows.length;

		if (rows.length < BATCH_SIZE) {
			break;
		}
	}

	log.info({ chartId, totalUpdated }, `Re-derived ${totalUpdated} score(s) for chart.`);

	return totalUpdated;
}
