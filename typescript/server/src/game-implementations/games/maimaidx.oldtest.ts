import type { ProvidedMetrics, ScoreData } from "tachi-common";

import { log } from "#lib/log/log.js";
import { CreatePBDoc } from "#lib/score-import/framework/pb/create-pb-doc";
import MONGODB_KILL from "#services/mongo/db";
import { dmf, mkMockPB, mkMockScore } from "#test-utils/misc";
import ResetDBState from "#test-utils/resets";
import { TestingMaimaiDXChart } from "#test-utils/test-data";
import { MAIMAI_DX_SINGLE_CONF } from "tachi-common/config/game-support/maimai-dx";
import t from "tap";

import { MAIMAIDX_IMPL } from "./maimaidx";

const baseMetrics: ProvidedMetrics["maimaidx:Single"] = {
	lamp: "CLEAR",
	percent: 97.012,
};

const GRADES = MAIMAI_DX_SINGLE_CONF.derivedMetrics.grade.values;
const LAMPS = MAIMAI_DX_SINGLE_CONF.providedMetrics.lamp.values;

const scoreData: ScoreData<"maimaidx:Single"> = {
	lamp: "CLEAR",
	percent: 97.012,
	grade: "SS",
	judgements: {},
	optional: { enumIndexes: {} },
	enumIndexes: {
		grade: GRADES.indexOf("SS"),
		lamp: LAMPS.indexOf("CLEAR"),
	},
};

const mockScore = mkMockScore("maimaidx", "Single", TestingMaimaiDXChart, scoreData);
const mockPB = mkMockPB("maimaidx", "Single", TestingMaimaiDXChart, scoreData);

t.test("Maimai DX Implementation", (t) => {
	t.test("Grade Deriver", (t) => {
		const f = (percent: number, expected: any) =>
			t.equal(
				MAIMAIDX_IMPL.scoreDeriver(dmf(baseMetrics, { percent }) as any, TestingMaimaiDXChart)
					.grade,
				expected,
				`A percent of ${percent} should result in grade=${expected}.`,
			);

		f(0, "D");
		f(50, "C");
		f(60, "B");
		f(70, "BB");
		f(75, "BBB");
		f(80, "A");
		f(90, "AA");
		f(94, "AAA");
		f(97, "S");
		f(98, "S+");
		f(99, "SS");
		f(99.5, "SS+");
		f(100, "SSS");
		f(100.5, "SSS+");

		t.end();
	});

	t.todo("Score Calcs");
	t.todo("Session Calcs");
	t.todo("Profile Calcs");

	t.test("Colour Deriver", (t) => {
		const f = (v: number | null, expected: any) =>
			t.equal(
				MAIMAIDX_IMPL.classDerivers({ naiveRate: v }).colour,
				expected,
				`A rate of ${v} should result in ${expected}.`,
			);

		f(null, null);
		f(0, "WHITE");

		f(15000, "RAINBOW");
		f(14500, "PLATINUM");
		f(14000, "GOLD");
		f(13000, "SILVER");
		f(12000, "BRONZE");
		f(10000, "PURPLE");
		f(7000, "RED");
		f(4000, "YELLOW");
		f(2000, "GREEN");
		f(1000, "BLUE");

		t.end();
	});

	t.test("Goal Formatters", (t) => {
		t.test("Criteria", (t) => {
			t.equal(MAIMAIDX_IMPL.goalCriteriaFormatters.percent(93.1415), "Get 93.1415% on");

			t.end();
		});

		t.test("Progress", (t) => {
			const f = (
				k: keyof typeof MAIMAIDX_IMPL.goalProgressFormatters,
				modifant: Partial<ScoreData<"maimaidx:Single">>,
				goalValue: any,
				expected: any,
			) =>
				t.equal(
					MAIMAIDX_IMPL.goalProgressFormatters[k](
						dmf(mockPB, {
							scoreData: modifant,
						}),
						goalValue,
					),
					expected,
				);

			f("grade", { grade: "S", percent: 97.5 }, GRADES.indexOf("SS"), "(S+)-0.5000%");
			f("percent", { percent: 98.23 }, 1_000_000, "98.2300%");
			f("lamp", { lamp: "CLEAR" }, LAMPS.indexOf("CLEAR"), "CLEAR");

			t.end();
		});

		t.test("Out Of", (t) => {
			t.equal(MAIMAIDX_IMPL.goalOutOfFormatters.percent(99.1123), "99.1123%");

			t.end();
		});

		t.end();
	});

	t.test("PB Merging", (t) => {
		t.beforeEach(ResetDBState);

		t.test("Should join best lamp", async (t) => {
			await MONGODB_KILL.scores.insert(mockScore);
			await MONGODB_KILL.scores.insert(
				dmf(mockScore, {
					scoreID: "bestLamp",
					scoreData: {
						percent: 0,
						lamp: "FULL COMBO",
						enumIndexes: { lamp: LAMPS.indexOf("FULL COMBO") },
					},
				}),
			);

			t.hasStrict(await CreatePBDoc("maimaidx:Single", 1, TestingMaimaiDXChart, log), {
				composedFrom: [
					{ name: "Best Percent" },
					{ name: "Best Lamp", scoreID: "bestLamp" },
				],
				scoreData: {
					percent: mockScore.scoreData.percent,
					lamp: "FULL COMBO",
					enumIndexes: { lamp: LAMPS.indexOf("FULL COMBO") },
				},
			});

			t.end();
		});

		t.end();
	});

	t.end();
});
