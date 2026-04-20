import type { DeepPartial } from "#utils/types";

import { log } from "#lib/log/log";
import { ParseDateFromString } from "#lib/score-import/framework/common/score-utils";
import {
	ChunithmClearStatus,
	ChunithmComboStatus,
	ChunithmFullChainStatus,
	ChunithmLevel,
	ChunithmScoreRank,
} from "#proto/generated/chunithm/common_pb";
import DB from "#services/pg/db";
import { dmf } from "#test-utils/misc";
import { TestingChunithmChartConverter, TestingChunithmSongConverter } from "#test-utils/test-data";
import { beforeEach, describe, expect, it } from "vitest";

import type { MytChunithmScore } from "./types";

import ConvertAPIMytChunithm from "./converter";

const parsedScore = {
	playlogApiId: "346907fc-ba1a-4ff9-a5a3-37a62b5f2e6c",
	info: {
		musicId: 956,
		level: ChunithmLevel.MASTER,
		score: 1001715,
		scoreRank: ChunithmScoreRank.SS,
		comboStatus: ChunithmComboStatus.NONE,
		fullChainStatus: ChunithmFullChainStatus.NONE,
		clearStatus: ChunithmClearStatus.CLEAR,
		track: 2,
		isNewRecord: false,
		userPlayDate: "2024-02-05T00:00:00.000Z",
	},
	judge: {
		judgeHeaven: 300,
		judgeCritical: 1159,
		judgeJustice: 37,
		judgeAttack: 4,
		judgeMiss: 10,
		maxCombo: 493,
	},
} as MytChunithmScore;

async function seedKillyJokerMaster() {
	await DB.insertInto("song")
		.values({
			id: TestingChunithmSongConverter.id,
			legacy_id: 956,
			game_group: "chunithm",
			title: TestingChunithmSongConverter.title,
			artist: TestingChunithmSongConverter.artist,
			search_terms: TestingChunithmSongConverter.searchTerms,
			alt_titles: TestingChunithmSongConverter.altTitles,
			data: TestingChunithmSongConverter.data,
			fts_document: "",
		})
		.execute();

	await DB.insertInto("chart")
		.values({
			id: TestingChunithmChartConverter.chartID,
			legacy_id: TestingChunithmChartConverter.chartID,
			game: "chunithm",
			song_id: TestingChunithmSongConverter.id,
			difficulty: TestingChunithmChartConverter.difficulty,
			level: TestingChunithmChartConverter.level,
			level_num: TestingChunithmChartConverter.levelNum,
			is_primary: TestingChunithmChartConverter.isPrimary,
			versions: TestingChunithmChartConverter.versions,
			data: TestingChunithmChartConverter.data,
		})
		.execute();
}

describe("ConvertAPIMytChunithm", () => {
	beforeEach(seedKillyJokerMaster);

	function convert(modifier: DeepPartial<MytChunithmScore> = {}) {
		return ConvertAPIMytChunithm(dmf(parsedScore, modifier), {}, "api/myt-chunithm", log);
	}

	it("returns song, chart, and dryScore for valid input", async () => {
		const res = await convert();

		expect(res).toStrictEqual({
			song: TestingChunithmSongConverter,
			chart: TestingChunithmChartConverter,
			dryScore: {
				service: "MYT",
				game: "chunithm",
				scoreMeta: {},
				timeAchieved: ParseDateFromString("2024-02-05T00:00:00.000Z"),
				comment: null,
				importType: "api/myt-chunithm",
				scoreData: {
					score: 1001715,
					clearLamp: "CLEAR",
					noteLamp: "NONE",
					judgements: {
						jcrit: 1459,
						justice: 37,
						attack: 4,
						miss: 10,
					},
					optional: {
						maxCombo: 493,
					},
				},
			},
		});
	});

	it("rejects WORLD'S END charts", async () => {
		await expect(
			convert({
				info: {
					musicId: 8032,
					level: ChunithmLevel.WORLDS_END,
				},
			}),
		).rejects.toMatchObject({
			failureType: "SkipScore",
			message: /WORLD'S END charts are not supported/u,
		});
	});

	it("rejects unspecified difficulty", async () => {
		await expect(
			convert({
				info: {
					level: ChunithmLevel.UNSPECIFIED,
				},
			}),
		).rejects.toMatchObject({
			message: expect.stringMatching(
				/Can't process a score with unspecified difficulty/u,
			) as string,
		});
	});

	it("maps note and clear lamps from proto enums", async () => {
		await expect(
			convert({
				info: {
					comboStatus: ChunithmComboStatus.ALL_JUSTICE_CRITICAL,
					clearStatus: ChunithmClearStatus.FAILED,
				},
			}),
		).resolves.toMatchObject({
			dryScore: { scoreData: { noteLamp: "ALL JUSTICE CRITICAL", clearLamp: "FAILED" } },
		});

		await expect(
			convert({
				info: {
					comboStatus: ChunithmComboStatus.ALL_JUSTICE,
					clearStatus: ChunithmClearStatus.FAILED,
				},
			}),
		).resolves.toMatchObject({
			dryScore: { scoreData: { noteLamp: "ALL JUSTICE", clearLamp: "FAILED" } },
		});

		await expect(
			convert({
				info: {
					comboStatus: ChunithmComboStatus.FULL_COMBO,
					clearStatus: ChunithmClearStatus.FAILED,
				},
			}),
		).resolves.toMatchObject({
			dryScore: { scoreData: { noteLamp: "FULL COMBO", clearLamp: "FAILED" } },
		});

		await expect(
			convert({
				info: {
					comboStatus: ChunithmComboStatus.NONE,
					clearStatus: ChunithmClearStatus.HARD,
				},
			}),
		).resolves.toMatchObject({
			dryScore: { scoreData: { noteLamp: "NONE", clearLamp: "HARD" } },
		});

		await expect(
			convert({
				info: {
					comboStatus: ChunithmComboStatus.NONE,
					clearStatus: ChunithmClearStatus.ABSOLUTE,
				},
			}),
		).resolves.toMatchObject({
			dryScore: { scoreData: { noteLamp: "NONE", clearLamp: "BRAVE" } },
		});

		await expect(
			convert({
				info: {
					comboStatus: ChunithmComboStatus.NONE,
					clearStatus: ChunithmClearStatus.ABSOLUTE_PLUS,
				},
			}),
		).resolves.toMatchObject({
			dryScore: { scoreData: { noteLamp: "NONE", clearLamp: "ABSOLUTE" } },
		});

		await expect(
			convert({
				info: {
					comboStatus: ChunithmComboStatus.NONE,
					clearStatus: ChunithmClearStatus.CATASTROPHY,
				},
			}),
		).resolves.toMatchObject({
			dryScore: { scoreData: { noteLamp: "NONE", clearLamp: "CATASTROPHY" } },
		});

		await expect(
			convert({
				info: {
					comboStatus: ChunithmComboStatus.NONE,
					clearStatus: ChunithmClearStatus.CLEAR,
				},
			}),
		).resolves.toMatchObject({
			dryScore: { scoreData: { noteLamp: "NONE", clearLamp: "CLEAR" } },
		});

		await expect(
			convert({
				info: {
					comboStatus: ChunithmComboStatus.NONE,
					clearStatus: ChunithmClearStatus.FAILED,
				},
			}),
		).resolves.toMatchObject({
			dryScore: { scoreData: { noteLamp: "NONE", clearLamp: "FAILED" } },
		});
	});

	it("rejects unspecified clear status", async () => {
		await expect(
			convert({
				info: {
					clearStatus: ChunithmClearStatus.UNSPECIFIED,
				},
			}),
		).rejects.toMatchObject({
			message: /Can't process a score with an invalid clear status/u,
		});
	});

	it("rejects unspecified combo status", async () => {
		await expect(
			convert({
				info: {
					comboStatus: ChunithmComboStatus.UNSPECIFIED,
				},
			}),
		).rejects.toMatchObject({
			message: /Can't process a score with an invalid combo status/u,
		});
	});

	it("throws when no chart matches musicId and difficulty", async () => {
		await expect(convert({ info: { musicId: 999999 } })).rejects.toMatchObject({
			failureType: "SongOrChartNotFound",
			message: /Can't find chart with id 999999 and difficulty MASTER/u,
		});
	});
});
