import type { Kysely } from "kysely";
import type { Database, Game } from "tachi-db";

import { UnixMillisecondsToISO8601 } from "#utils/time";
import {
	type ClassDelta,
	type GameGroup,
	GamePTToV3,
	type GoalImportInfo,
	type ImportTypes,
	type integer,
	type Playtype,
	type QuestImportInfo,
	type SessionInfoReturn,
} from "tachi-common";

type ImportErrRow = { message: string; type: string };

export interface FinalizeImportTiming {
	parseMs: number;
	importMs: number;
	importParseMs: number;
	sessionMs: number;
	pbMs: number;
	ugsMs: number;
	goalMs: number;
	questMs: number;
	totalMs: number;
}

/**
 * Commits staged scores and writes normalized import metadata + timing in one transaction.
 */
export async function finalizeImportToPostgres(
	db: Kysely<Database>,
	args: {
		classDeltas: Array<ClassDelta>;
		createdSessions: Array<SessionInfoReturn>;
		errors: Array<ImportErrRow>;
		gameGroup: GameGroup;
		goalInfo: Array<GoalImportInfo>;
		importId: string;
		importType: ImportTypes;
		playtypes: Array<Playtype>;
		questInfo: Array<QuestImportInfo>;
		service: string;
		timeFinishedMs: number;
		timeStartedMs: number;
		timing: FinalizeImportTiming;
		userId: integer;
		userIntent: boolean;
	},
): Promise<void> {
	const {
		importId,
		gameGroup,
		importType,
		userIntent,
		service,
		timeStartedMs,
		timeFinishedMs,
		playtypes,
		errors,
		classDeltas,
		createdSessions,
		goalInfo,
		questInfo,
		timing,
	} = args;

	const timeStarted = UnixMillisecondsToISO8601(timeStartedMs);
	const timeFinished = UnixMillisecondsToISO8601(timeFinishedMs);
	const tsNow = new Date().toISOString();

	await db
		.updateTable("import")
		.set({
			time_started: timeStarted,
			time_finished: timeFinished,
			game_group: gameGroup,
			import_type: importType,
			user_intent: userIntent,
			service,
		})
		.where("id", "=", importId)
		.execute();

	await db
		.updateTable("score")
		.set({ committed: true })
		.where("import_id", "=", importId)
		.where("committed", "=", false)
		.execute();

	await db.deleteFrom("import_game").where("id", "=", importId).execute();

	for (const pt of playtypes) {
		const v3Game = GamePTToV3(gameGroup, pt) as Game;

		await db.insertInto("import_game").values({ id: importId, game: v3Game }).execute();
	}

	await db.deleteFrom("import_error").where("import_id", "=", importId).execute();

	for (const err of errors) {
		await db
			.insertInto("import_error")
			.values({
				import_id: importId,
				type: err.type,
				message: err.message,
			})
			.execute();
	}

	await db.deleteFrom("import_class").where("import_id", "=", importId).execute();

	for (const d of classDeltas) {
		const v3Game = GamePTToV3(d.game, d.playtype) as Game;

		await db
			.insertInto("import_class")
			.values({
				import_id: importId,
				game: v3Game,
				set: d.set as string,
				prev: d.old,
				new: d.new,
			})
			.execute();
	}

	await db.deleteFrom("import_session").where("import_id", "=", importId).execute();

	for (const s of createdSessions) {
		await db
			.insertInto("import_session")
			.values({
				import_id: importId,
				session_id: s.sessionID,
				type: s.type.toLowerCase() as "appended" | "created",
			})
			.execute();
	}

	await db.deleteFrom("import_goal").where("import_id", "=", importId).execute();

	for (const g of goalInfo) {
		await db
			.insertInto("import_goal")
			.values({
				import_id: importId,
				goal_id: g.goalID,
				prev_achieved: g.old.achieved,
				prev_out_of: g.old.outOf,
				prev_out_of_human: g.old.outOfHuman,
				prev_progress: g.old.progress,
				prev_progress_human: g.old.progressHuman,
				new_achieved: g.new.achieved,
				new_out_of: g.new.outOf,
				new_out_of_human: g.new.outOfHuman,
				new_progress: g.new.progress,
				new_progress_human: g.new.progressHuman,
			})
			.execute();
	}

	await db.deleteFrom("import_quest").where("import_id", "=", importId).execute();

	for (const q of questInfo) {
		await db
			.insertInto("import_quest")
			.values({
				import_id: importId,
				quest_id: q.questID,
				prev_achieved: q.old.achieved,
				prev_progress: q.old.progress,
				new_achieved: q.new.achieved,
				new_progress: q.new.progress,
			})
			.execute();
	}

	const n = Math.max(1, playtypes.length);

	await db
		.insertInto("import_timing")
		.values({
			id: importId,
			timestamp: tsNow,
			import_secs_avg: timing.importMs / n,
			import_parse_secs_avg: timing.importParseMs / n,
			pb_secs_avg: timing.pbMs / n,
			session_secs_avg: timing.sessionMs / n,
			parse_secs: timing.parseMs,
			import_secs: timing.importMs,
			import_parse_secs: timing.importParseMs,
			session_secs: timing.sessionMs,
			pb_secs: timing.pbMs,
			ugs_secs: timing.ugsMs,
			goal_secs: timing.goalMs,
			quest_secs: timing.questMs,
			total_secs: timing.totalMs,
		})
		.onConflict((oc) =>
			oc.column("id").doUpdateSet({
				timestamp: tsNow,
				import_secs_avg: timing.importMs / n,
				import_parse_secs_avg: timing.importParseMs / n,
				pb_secs_avg: timing.pbMs / n,
				session_secs_avg: timing.sessionMs / n,
				parse_secs: timing.parseMs,
				import_secs: timing.importMs,
				import_parse_secs: timing.importParseMs,
				session_secs: timing.sessionMs,
				pb_secs: timing.pbMs,
				ugs_secs: timing.ugsMs,
				goal_secs: timing.goalMs,
				quest_secs: timing.questMs,
				total_secs: timing.totalMs,
			}),
		)
		.execute();
}
