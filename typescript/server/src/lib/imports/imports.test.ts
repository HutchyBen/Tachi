import { mongoScoreDataToPg } from "#lib/v3/migration-tools";
import DB from "#services/pg/db";
import { mkFakeImport, mkFakeScoreIIDXSP } from "#test-utils/misc";
import { seedUser } from "#test-utils/pg-fixtures";
import { Testing511Song, Testing511SPA } from "#test-utils/test-data";
import { UnixMillisecondsToISO8601 } from "#utils/time";
import { beforeEach, describe, expect, it } from "vitest";

import { RevertImport } from "./imports";

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

async function insertIidxScore(opts: {
	chartId: string;
	importId: string | null;
	scoreId: string;
	userId: number;
}) {
	const doc = mkFakeScoreIIDXSP({
		userID: opts.userId,
		chartID: opts.chartId,
		scoreID: opts.scoreId,
	});
	const { data, derived, judgements } = mongoScoreDataToPg("iidx-sp", doc.scoreData);
	const ts = UnixMillisecondsToISO8601(Date.now());

	await DB.insertInto("score")
		.values({
			id: opts.scoreId,
			user_id: opts.userId,
			chart_id: opts.chartId,
			game: "iidx-sp",
			session_id: null,
			import_id: opts.importId,
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
}

describe("RevertImport", () => {
	beforeEach(seedIidx511Chart);

	it("deletes the import row and only scores linked by import_id", async () => {
		const { id: userId } = await seedUser({ username: "revert_import_u" });
		const chartId = chart.chartID;
		const importId = `revert-imp-${Date.now()}`;
		const now = new Date().toISOString();

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
			})
			.execute();

		await insertIidxScore({ userId, scoreId: "score_1", chartId, importId });
		await insertIidxScore({ userId, scoreId: "score_2", chartId, importId });
		await insertIidxScore({ userId, scoreId: "score_3", chartId, importId: null });

		const importDoc = mkFakeImport({
			importID: importId,
			userID: userId,
			scoreIDs: ["score_1", "score_2"],
		});

		const err = await RevertImport(importDoc);
		expect(err).toBeNull();

		const importRow = await DB.selectFrom("import")
			.select("id")
			.where("id", "=", importId)
			.executeTakeFirst();
		expect(importRow).toBeUndefined();

		const s1 = await DB.selectFrom("score")
			.select("id")
			.where("id", "=", "score_1")
			.executeTakeFirst();
		const s2 = await DB.selectFrom("score")
			.select("id")
			.where("id", "=", "score_2")
			.executeTakeFirst();
		const s3 = await DB.selectFrom("score")
			.select("id")
			.where("id", "=", "score_3")
			.executeTakeFirst();

		expect(s1).toBeUndefined();
		expect(s2).toBeUndefined();
		expect(s3).toEqual({ id: "score_3" });
	});
});
