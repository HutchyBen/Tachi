import { log } from "#lib/log/log";
import { ProcessPBs } from "#lib/score-import/framework/pb/process-pbs";
import { rederiveScoresForChart } from "#lib/score-import/framework/pb/rederive-scores";
import DB from "#services/pg/db";
import { type GameGroup, type integer, type Playtype, type V3Game, V3ToGamePT } from "tachi-common";

const PB_DIRTY_BATCH = 1000;
const SCORE_REDERIVE_BATCH = 50;

/**
 * Drain the `pb_dirty` queue: group entries by (game, playtype, user_id),
 * call ProcessPBs per group, and delete processed rows.
 */
export async function drainPbDirty(): Promise<number> {
	const rows = await DB.selectFrom("pb_dirty")
		.innerJoin("chart", "chart.id", "pb_dirty.chart_id")
		.select(["pb_dirty.user_id", "pb_dirty.chart_id", "chart.game as chart_game"])
		.orderBy("pb_dirty.enqueued_at", "asc")
		.limit(PB_DIRTY_BATCH)
		.execute();

	if (rows.length === 0) {
		return 0;
	}

	const groups = new Map<
		string,
		{ chartIDs: Set<string>; game: GameGroup; playtype: Playtype; userID: integer }
	>();

	for (const row of rows) {
		const { game, playtype } = V3ToGamePT(row.chart_game as V3Game);
		const key = `${game}:${playtype}:${row.user_id}`;

		let group = groups.get(key);

		if (!group) {
			group = { game, playtype, userID: row.user_id, chartIDs: new Set() };
			groups.set(key, group);
		}

		group.chartIDs.add(row.chart_id);
	}

	for (const group of groups.values()) {
		// eslint-disable-next-line no-await-in-loop
		await ProcessPBs(group.game, group.playtype, group.userID, group.chartIDs, log);
	}

	const processedPairs = rows.map((r) => [r.user_id, r.chart_id] as const);

	for (const [userId, chartId] of processedPairs) {
		// eslint-disable-next-line no-await-in-loop
		await DB.deleteFrom("pb_dirty")
			.where("pb_dirty.user_id", "=", userId)
			.where("pb_dirty.chart_id", "=", chartId)
			.execute();
	}

	log.info(`Drained ${rows.length} pb_dirty entries across ${groups.size} user/game groups.`);

	return rows.length;
}

/**
 * Drain the `score_rederive` queue: for each chart, re-derive all scores,
 * then delete the queue entry. The score UPDATEs will fire `score_pb_dirty`
 * triggers, so PB recalculation happens automatically.
 */
export async function drainScoreRederive(): Promise<number> {
	const rows = await DB.selectFrom("score_rederive")
		.select(["score_rederive.chart_id"])
		.orderBy("score_rederive.enqueued_at", "asc")
		.limit(SCORE_REDERIVE_BATCH)
		.execute();

	if (rows.length === 0) {
		return 0;
	}

	let totalScores = 0;

	for (const row of rows) {
		// eslint-disable-next-line no-await-in-loop
		const updated = await rederiveScoresForChart(row.chart_id, log);

		totalScores += updated;

		// eslint-disable-next-line no-await-in-loop
		await DB.deleteFrom("score_rederive")
			.where("score_rederive.chart_id", "=", row.chart_id)
			.execute();
	}

	log.info(
		`Drained ${rows.length} score_rederive entries, re-derived ${totalScores} total scores.`,
	);

	return rows.length;
}

/**
 * Delete `pb_dirty` rows for the given user + chart IDs. Call this after
 * a synchronous `ProcessPBs` to prevent the async worker from redundantly
 * reprocessing the same pairs.
 */
export async function clearPbDirtyForUser(
	userID: integer,
	chartIDs: Iterable<string>,
): Promise<void> {
	const ids = [...chartIDs];

	if (ids.length === 0) {
		return;
	}

	await DB.deleteFrom("pb_dirty")
		.where("pb_dirty.user_id", "=", userID)
		.where("pb_dirty.chart_id", "in", ids)
		.execute();
}
