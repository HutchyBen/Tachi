import {
	type ScoreDocumentJoinRow,
	SELECT_SCORE_DOCUMENT,
	ToScoreDocument,
} from "#lib/db-formats/score";
import { SELECT_SESSION_DOCUMENT } from "#lib/db-formats/session";
import { log } from "#lib/log/log";
import { CreateSessionCalcData } from "#lib/score-import/framework/calculated-data/session";
import { ProcessPBs } from "#lib/score-import/framework/pb/process-pbs";
import { rederiveScoresForChart } from "#lib/score-import/framework/pb/rederive-scores";
import { scoreVisibleSql } from "#lib/score-import/framework/pg/score-visibility";
import { UpdateUsersGamePlaytypeStats } from "#lib/score-import/framework/ugpt-stats/update-ugpt-stats";
import DB from "#services/pg/db";
import {
	type GameGroup,
	type integer,
	LEGACY_GameGroupPTToGame,
	LEGACY_GameToGameGroupPT,
	type LEGACY_Playtype,
	type V3Game,
} from "tachi-common";

const PB_DIRTY_BATCH = 5000;
const SCORE_REDERIVE_BATCH = 5000;
const SESSION_DIRTY_BATCH = 5000;
const GAME_PROFILE_DIRTY_BATCH = 500;
/** Safety cap for one cron tick across score_rederive + pb_dirty + session + game_profile drains. */
const STATS_QUEUE_DRAIN_CAP = 100_000;

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
		{ chartIDs: Set<string>; game: GameGroup; playtype: LEGACY_Playtype; userID: integer }
	>();

	for (const row of rows) {
		const { gameGroup: game, playtype } = LEGACY_GameToGameGroupPT(row.chart_game as V3Game);
		const key = `${game}:${playtype}:${row.user_id}`;

		let group = groups.get(key);

		if (!group) {
			group = { game, playtype, userID: row.user_id, chartIDs: new Set() };
			groups.set(key, group);
		}

		group.chartIDs.add(row.chart_id);
	}

	for (const group of groups.values()) {
		const v3Game = LEGACY_GameGroupPTToGame(group.game, group.playtype);
		// eslint-disable-next-line no-await-in-loop
		await ProcessPBs(v3Game, group.userID, group.chartIDs, log);
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

	log.debug(
		`Drained ${rows.length} score_rederive entries, re-derived ${totalScores} total scores.`,
	);

	return rows.length;
}

/**
 * Drain `session_dirty`: recompute `session.calculated_data` from visible scores in that session.
 */
export async function drainSessionDirty(): Promise<number> {
	const rows = await DB.selectFrom("session_dirty")
		.select(["session_dirty.session_id"])
		.orderBy("session_dirty.enqueued_at", "asc")
		.limit(SESSION_DIRTY_BATCH)
		.execute();

	if (rows.length === 0) {
		return 0;
	}

	for (const row of rows) {
		const sessionId = row.session_id;

		// eslint-disable-next-line no-await-in-loop
		const scoreRows = await DB.selectFrom("score")
			.innerJoin("chart", "chart.id", "score.chart_id")
			.innerJoin("song", "song.id", "chart.song_id")
			.leftJoin("import", "import.id", "score.import_id")
			.select(SELECT_SCORE_DOCUMENT)
			.where("score.session_id", "=", sessionId)
			.where(scoreVisibleSql())
			.execute();

		if (scoreRows.length === 0) {
			// eslint-disable-next-line no-await-in-loop
			await DB.deleteFrom("session_dirty")
				.where("session_dirty.session_id", "=", sessionId)
				.execute();
			continue;
		}

		// eslint-disable-next-line no-await-in-loop
		const sessionRow = await DB.selectFrom("session")
			.select(SELECT_SESSION_DOCUMENT)
			.where("session.id", "=", sessionId)
			.executeTakeFirst();

		if (!sessionRow) {
			// eslint-disable-next-line no-await-in-loop
			await DB.deleteFrom("session_dirty")
				.where("session_dirty.session_id", "=", sessionId)
				.execute();
			continue;
		}

		const scoreDocs = scoreRows.map((r) => ToScoreDocument(r as ScoreDocumentJoinRow));
		const calculatedData = CreateSessionCalcData(sessionRow.game as V3Game, scoreDocs);

		// eslint-disable-next-line no-await-in-loop
		await DB.updateTable("session")
			.set({
				calculated_data: JSON.stringify(calculatedData),
			})
			.where("session.id", "=", sessionId)
			.execute();

		// eslint-disable-next-line no-await-in-loop
		await DB.deleteFrom("session_dirty")
			.where("session_dirty.session_id", "=", sessionId)
			.execute();
	}

	log.info(`Drained ${rows.length} session_dirty entries.`);

	return rows.length;
}

/**
 * Drain `game_profile_dirty`: recompute `game_profile` ratings/classes for each (user, playtype).
 */
export async function drainGameProfileDirty(): Promise<number> {
	const rows = await DB.selectFrom("game_profile_dirty")
		.select(["game_profile_dirty.user_id", "game_profile_dirty.game"])
		.orderBy("game_profile_dirty.enqueued_at", "asc")
		.limit(GAME_PROFILE_DIRTY_BATCH)
		.execute();

	if (rows.length === 0) {
		return 0;
	}

	for (const row of rows) {
		const userId = row.user_id;

		// eslint-disable-next-line no-await-in-loop
		await UpdateUsersGamePlaytypeStats(row.game as V3Game, userId, null, log);

		// eslint-disable-next-line no-await-in-loop
		await DB.deleteFrom("game_profile_dirty")
			.where("game_profile_dirty.user_id", "=", userId)
			.where("game_profile_dirty.game", "=", row.game)
			.execute();
	}

	log.info(`Drained ${rows.length} game_profile_dirty entries.`);

	return rows.length;
}

/**
 * Drain `score_rederive`, then `pb_dirty`, then `session_dirty`, then `game_profile_dirty`,
 * repeating until a full pass does nothing or `STATS_QUEUE_DRAIN_CAP` row-processings is reached.
 * PBs must run before game profiles (ratings read from `pb`).
 */
export async function drainStatsQueuesInOrder(): Promise<void> {
	let totalProcessed = 0;

	while (totalProcessed < STATS_QUEUE_DRAIN_CAP) {
		let cycleMoved = 0;

		while (totalProcessed < STATS_QUEUE_DRAIN_CAP) {
			// eslint-disable-next-line no-await-in-loop
			const n = await drainScoreRederive();

			if (n === 0) {
				break;
			}

			cycleMoved += n;
			totalProcessed += n;
		}

		while (totalProcessed < STATS_QUEUE_DRAIN_CAP) {
			// eslint-disable-next-line no-await-in-loop
			const n = await drainPbDirty();

			if (n === 0) {
				break;
			}

			cycleMoved += n;
			totalProcessed += n;
		}

		while (totalProcessed < STATS_QUEUE_DRAIN_CAP) {
			// eslint-disable-next-line no-await-in-loop
			const n = await drainSessionDirty();

			if (n === 0) {
				break;
			}

			cycleMoved += n;
			totalProcessed += n;
		}

		while (totalProcessed < STATS_QUEUE_DRAIN_CAP) {
			// eslint-disable-next-line no-await-in-loop
			const n = await drainGameProfileDirty();

			if (n === 0) {
				break;
			}

			cycleMoved += n;
			totalProcessed += n;
		}

		if (cycleMoved === 0) {
			break;
		}
	}
}

/**
 * Drain `score_rederive`, then `pb_dirty`, `session_dirty`, and `game_profile_dirty`,
 * repeating until a full pass moves nothing. No per-tick row cap (unlike the cron
 * drain) - intended for admin synchronous recalc.
 */
export async function drainStatsQueuesFully(): Promise<void> {
	for (;;) {
		let cycleMoved = 0;

		for (;;) {
			const n = await drainScoreRederive();

			if (n === 0) {
				break;
			}

			cycleMoved += n;
		}

		for (;;) {
			const n = await drainPbDirty();

			if (n === 0) {
				break;
			}

			cycleMoved += n;
		}

		for (;;) {
			const n = await drainSessionDirty();

			if (n === 0) {
				break;
			}

			cycleMoved += n;
		}

		for (;;) {
			const n = await drainGameProfileDirty();

			if (n === 0) {
				break;
			}

			cycleMoved += n;
		}

		if (cycleMoved === 0) {
			break;
		}
	}
}

/**
 * Drain `pb_dirty` then `session_dirty` and `game_profile_dirty`, repeating until
 * idle. No per-tick row cap - intended for admin synchronous PB recalc.
 */
export async function drainPbDirtyAndDownstream(): Promise<void> {
	for (;;) {
		let cycleMoved = 0;

		for (;;) {
			const n = await drainPbDirty();

			if (n === 0) {
				break;
			}

			cycleMoved += n;
		}

		for (;;) {
			const n = await drainSessionDirty();

			if (n === 0) {
				break;
			}

			cycleMoved += n;
		}

		for (;;) {
			const n = await drainGameProfileDirty();

			if (n === 0) {
				break;
			}

			cycleMoved += n;
		}

		if (cycleMoved === 0) {
			break;
		}
	}
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
