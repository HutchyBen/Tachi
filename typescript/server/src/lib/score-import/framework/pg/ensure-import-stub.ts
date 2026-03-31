import type { GameGroup, ImportTypes, integer } from "tachi-common";

import DB from "#services/pg/db";

/**
 * Inserts the base `import` row at the start of a run so scores can reference `import_id` (FK on orphan_score, etc.).
 * Uses placeholder `time_finished` equal to `time_started`; {@link finalizeImportToPostgres} updates them.
 */
export async function ensureImportStub(
	importId: string,
	userId: integer,
	gameGroup: GameGroup,
	importType: ImportTypes,
	userIntent: boolean,
	service = "Unknown",
): Promise<void> {
	const now = new Date().toISOString();

	await DB.insertInto("import")
		.values({
			id: importId,
			user_id: userId,
			time_started: now,
			time_finished: now,
			game_group: gameGroup,
			import_type: importType,
			user_intent: userIntent,
			service,
		})
		.execute();
}

/**
 * Removes an in-progress import run: staged scores and the import stub (and dependent rows cascade or explicit deletes).
 */
export async function deleteImportRun(importId: string): Promise<void> {
	await DB.deleteFrom("score")
		.where("import_id", "=", importId)
		.where("committed", "=", false)
		.execute();

	// import_* / import_timing / import_game rows cascade. orphan_score.import_id is set null (not deleted).
	await DB.deleteFrom("import").where("id", "=", importId).execute();
}
