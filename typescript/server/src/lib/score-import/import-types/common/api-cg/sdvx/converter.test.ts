import type { DryScore } from "#lib/score-import/framework/common/types";

import { log } from "#lib/log/log";
import { ParseDateFromString } from "#lib/score-import/framework/common/score-utils";
import DB from "#services/pg/db";
import { dmf } from "#test-utils/misc";
import { TestingAlbidaADV, TestingSDVXAlbidaSong } from "#test-utils/test-data";
import { beforeEach, describe, expect, it } from "vitest";

import type { CGContext, CGSDVXScore } from "../types";

import { ConverterAPICGSDVX } from "./converter";

function mkInput(modifant: Partial<CGSDVXScore> = {}) {
	const validInput: CGSDVXScore = {
		internalId: 1,
		difficulty: 1,
		dateTime: "2019-06-06 08:14:22",
		score: 9_123_000,
		version: 6,
		clearType: 2,
		critical: 100,
		near: 50,
		error: 10,
		exScore: 1234,
		maxChain: 300,
		scoreGrade: "whatever, this is unused",
	};

	return dmf(validInput, modifant);
}

function mkOutput(modifant: Partial<DryScore<"sdvx">> = {}): DryScore<"sdvx"> {
	const validOutput: DryScore<"sdvx"> = {
		comment: null,
		game: "sdvx",
		importType: "api/cg-dev-sdvx",
		timeAchieved: ParseDateFromString("2019-06-06 08:14:22"),
		service: "CG Dev",
		scoreData: {
			score: 9_123_000,
			lamp: "CLEAR",
			judgements: {
				critical: 100,
				near: 50,
				miss: 10,
			},
			optional: {
				maxCombo: 300,
				exScore: 1234,
			},
		},
		scoreMeta: {},
	};

	return dmf(validOutput, modifant);
}

async function seedSdvxCgFixture() {
	await DB.insertInto("song")
		.values({
			id: TestingSDVXAlbidaSong.id,
			legacy_id: 1,
			game_group: "sdvx",
			title: TestingSDVXAlbidaSong.title,
			artist: TestingSDVXAlbidaSong.artist,
			search_terms: TestingSDVXAlbidaSong.searchTerms,
			alt_titles: TestingSDVXAlbidaSong.altTitles,
			data: TestingSDVXAlbidaSong.data,
			fts_document: "",
		})
		.execute();

	await DB.insertInto("chart")
		.values({
			id: TestingAlbidaADV.chartID,
			legacy_id: TestingAlbidaADV.chartID,
			game: "sdvx",
			song_id: TestingSDVXAlbidaSong.id,
			difficulty: "ADV",
			level: TestingAlbidaADV.level,
			level_num: TestingAlbidaADV.levelNum,
			is_primary: TestingAlbidaADV.isPrimary,
			versions: TestingAlbidaADV.versions,
			data: TestingAlbidaADV.data,
		})
		.execute();
}

describe("ConverterAPICGSDVX", () => {
	const context: CGContext = {
		service: "dev",
		userID: 1,
	};

	beforeEach(seedSdvxCgFixture);

	const convert = (modifant: Partial<CGSDVXScore> = {}) =>
		ConverterAPICGSDVX(mkInput(modifant), context, "api/cg-dev-sdvx", log);

	it("converts valid input", async () => {
		const res = await convert();

		expect(res.song).toMatchObject({ id: TestingSDVXAlbidaSong.id });
		expect(res.chart).toMatchObject({
			difficulty: "ADV",
			data: {
				inGameID: 1,
			},
		});
		expect(res.dryScore).toStrictEqual(mkOutput());
	});

	it("maps clearType to lamp", async () => {
		const lampOnly = (lamp: DryScore<"sdvx">["scoreData"]["lamp"]) =>
			mkOutput({
				scoreData: {
					score: 9_123_000,
					lamp,
					judgements: { critical: 100, near: 50, miss: 10 },
					optional: { maxCombo: 300, exScore: 1234 },
				},
			});

		await expect(convert({ clearType: 1 })).resolves.toMatchObject({
			dryScore: lampOnly("FAILED"),
		});
		await expect(convert({ clearType: 2 })).resolves.toMatchObject({
			dryScore: lampOnly("CLEAR"),
		});
		await expect(convert({ clearType: 3 })).resolves.toMatchObject({
			dryScore: lampOnly("EXCESSIVE CLEAR"),
		});
		await expect(convert({ clearType: 4 })).resolves.toMatchObject({
			dryScore: lampOnly("ULTIMATE CHAIN"),
		});
		await expect(convert({ clearType: 5 })).resolves.toMatchObject({
			dryScore: lampOnly("PERFECT ULTIMATE CHAIN"),
		});
	});
});
