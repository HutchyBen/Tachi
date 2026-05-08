import type { Database } from "tachi-db";

import DB from "#services/pg/db";
import { type ExpressionBuilder, sql } from "kysely";

import { getActiveImportId } from "../import-run-context";

/**
 * SQL predicate: score row is visible for import logic (committed scores, or scores from the active import run).
 */
export function scoreVisiblePredicate(eb: ExpressionBuilder<Database, "score">) {
	const importId = getActiveImportId();

	if (importId === null) {
		return eb("score.committed", "=", true);
	}

	return sql<boolean>`(score.committed = true OR score.import_id = ${importId})`;
}

/**
 * Same as {@link scoreVisiblePredicate}, but as a standalone expression for queries that join `score` with other tables (Kysely's `ExpressionBuilder` table set differs).
 *
 * TODO(zk): move scores into an "internal_scores" table, then have a "scores" view which contains only
 * the visible ones - allows us to ban users and stuff.
 */
export function scoreVisibleSql() {
	const importId = getActiveImportId();

	if (importId === null) {
		return sql<boolean>`score.committed = true`;
	}

	return sql<boolean>`(score.committed = true OR score.import_id = ${importId})`;
}

/** Deletes all uncommitted scores for an import run (failed import cleanup). */
export async function deleteUncommittedScoresForImport(importId: string): Promise<void> {
	await DB.deleteFrom("score")
		.where("import_id", "=", importId)
		.where("committed", "=", false)
		.execute();
}

/** Marks staged scores as committed after successful post-import steps. */
export async function commitScoresForImport(importId: string): Promise<void> {
	await DB.updateTable("score")
		.set({ committed: true })
		.where("import_id", "=", importId)
		.where("committed", "=", false)
		.execute();
}
