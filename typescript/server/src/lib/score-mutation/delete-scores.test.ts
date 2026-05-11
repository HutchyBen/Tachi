import { LoadScoreDocumentsForImport } from "#lib/db-formats/score";
import { mongoScoreDataToPg } from "#lib/v3/migration-tools";
import DB from "#services/pg/db";
import { mkFakeScoreIIDXSP } from "#test-utils/misc";
import { seedUser } from "#test-utils/pg-fixtures";
import { Testing511Song, Testing511SPA } from "#test-utils/test-data";
import { UnixMillisecondsToISO8601 } from "#utils/time";
import { beforeEach, describe, expect, it } from "vitest";

import { DeleteMultipleScores } from "./delete-scores";

const chart = Testing511SPA;

async function seedIidx511Chart() {
	await DB.insertInto("song")
		.values({
			id: Testing511Song.id,
			legacy_id: 1,
			game_group: "iidx",
			title: Testing511Song.title,
			artist: Testing511Song.artist,
			search_terms: Testing511Song.searchTerms,
			alt_titles: Testing511Song.altTitles,
			data: Testing511Song.data,
			fts_document: "",
		})
		.execute();

	await DB.insertInto("chart")
		.values({
			id: chart.chartID,
			legacy_id: chart.chartID,
			game: "iidx-sp",
			song_id: Testing511Song.id,
			difficulty: chart.difficulty,
			level: chart.level,
			level_num: chart.levelNum,
			is_primary: chart.isPrimary,
			versions: chart.versions,
			data: chart.data,
		})
		.execute();
}

describe("DeleteMultipleScores", () => {
	beforeEach(seedIidx511Chart);

	it("deletes an empty session and relies on FK CASCADE for import_session (#82)", async () => {
		const { id: userId } = await seedUser({ username: "del_scores_sess_fk" });
		const chartId = chart.chartID;
		const importId = `del-scores-imp-${Date.now()}`;
		const sessionId = "sess-delete-scores-import-fk";
		const scoreId = "score_delete_scores_import_fk";
		const now = new Date().toISOString();

		await DB.insertInto("session")
			.values({
				id: sessionId,
				user_id: userId,
				game: "iidx-sp",
				name: "x",
				description: null,
				time_inserted: now,
				time_started: now,
				time_ended: now,
				calculated_data: JSON.stringify({}),
				highlight: false,
			})
			.execute();

		await DB.insertInto("import")
			.values({
				id: importId,
				user_id: userId,
				time_started: now,
				time_finished: now,
				game_group: "iidx",
				import_type: "file/batch-manual" as never,
				user_intent: true,
				service: "test",
				status: "completed",
			})
			.execute();

		await DB.insertInto("import_session")
			.values({
				import_id: importId,
				session_id: sessionId,
				type: "created",
			})
			.execute();

		const doc = mkFakeScoreIIDXSP({
			userID: userId,
			chartID: chartId,
			scoreID: scoreId,
		});
		const { data, derived, judgements } = mongoScoreDataToPg("iidx-sp", doc.scoreData);
		const ts = UnixMillisecondsToISO8601(Date.now());

		await DB.insertInto("score")
			.values({
				id: scoreId,
				user_id: userId,
				chart_id: chartId,
				game: "iidx-sp",
				session_id: sessionId,
				import_id: importId,
				data: JSON.stringify(data),
				derived_data: JSON.stringify(derived),
				judgements: JSON.stringify(judgements),
				calculated_data: JSON.stringify({}),
				meta: JSON.stringify({}),
				time_achieved: ts,
				time_added: ts,
				highlight: false,
				comment: null,
			})
			.execute();

		const toDelete = await LoadScoreDocumentsForImport(importId);

		await DeleteMultipleScores(toDelete);

		const deletedScore = await DB.selectFrom("score")
			.select("id")
			.where("id", "=", scoreId)
			.executeTakeFirst();

		expect(deletedScore).toBeUndefined();

		const sess = await DB.selectFrom("session")
			.select("id")
			.where("id", "=", sessionId)
			.executeTakeFirst();
		expect(sess).toBeUndefined();

		const link = await DB.selectFrom("import_session")
			.select("row_id")
			.where("session_id", "=", sessionId)
			.executeTakeFirst();
		expect(link).toBeUndefined();

		const importStill = await DB.selectFrom("import")
			.select("id")
			.where("id", "=", importId)
			.executeTakeFirst();
		expect(importStill).toEqual({ id: importId });
	});
});
