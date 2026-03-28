import { SDVX_GRADES, SDVX_LAMPS, type MongoScoreData } from "tachi-common";
import { describe, expect, it } from "vitest";

import { mergeScoreDataFromPg, mongoScoreDataToPg } from "./migration-tools.js";

describe("mergeScoreDataFromPg", () => {
	const scoreData = {
		score: 9_876_543,
		lamp: "EXCESSIVE CLEAR",
		grade: "S",
		optional: {
			enumIndexes: {},
			exScore: 123,
			fast: 32,
			gauge: 99,
			maxCombo: 9,
			slow: 42,
		},
		enumIndexes: {
			grade: SDVX_GRADES.S,
			lamp: SDVX_LAMPS.EXCESSIVE_CLEAR,
		},
		judgements: {
			critical: 123,
			miss: 23,
			near: 22,
		},
	} satisfies MongoScoreData<"sdvx:Single">;

	it("roundtrips as expected (sdvx:Single)", () => {
		const gpt = "sdvx:Single";

		const { data, derived } = mongoScoreDataToPg(gpt, scoreData);
		const merged = mergeScoreDataFromPg(gpt, data, derived);

		expect(merged).toStrictEqual(scoreData);
	});
});
