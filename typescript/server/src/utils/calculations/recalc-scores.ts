import DB from "#services/pg/db";

/**
 * Enqueue every chart into `score_rederive` so the async worker will
 * re-run `scoreDeriver` + `scoreCalcs` on every score. The worker also
 * fires PB recalculation via the `pb_dirty` trigger.
 */
export async function RecalcAllScores(): Promise<void> {
	await DB.insertInto("score_rederive")
		.expression(DB.selectFrom("chart").select(["chart.id as chart_id"]))
		.onConflict((oc) => oc.doNothing())
		.execute();
}

/**
 * Enqueue every (user_id, chart_id) pair from the `score` table into
 * `pb_dirty` so the async worker will recalculate PBs for all users.
 */
export async function UpdateAllPBs(): Promise<void> {
	await DB.insertInto("pb_dirty")
		.expression(DB.selectFrom("score").select(["score.user_id", "score.chart_id"]).distinct())
		.onConflict((oc) => oc.doNothing())
		.execute();
}
