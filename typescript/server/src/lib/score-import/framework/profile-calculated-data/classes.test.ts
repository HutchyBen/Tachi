import { log } from "#lib/log/log.js";
import ResetDBState from "#test-utils/resets";
import t from "tap";

import { GITADORA_COLOURS, type UserGameStats } from "tachi-common";
import { CalculateUGPTClasses, ProcessClassDeltas } from "./classes";

t.test("#CalculateUGPTClasses", (t) => {
	t.test("Should produce an empty object by default", async (t) => {
		const res = await CalculateUGPTClasses("iidx", "SP", 1, {}, null, log);

		t.strictSame(res, {});

		t.end();
	});

	t.test("Should call and merge the ClassHandler", async (t) => {
		const res = await CalculateUGPTClasses("iidx", "SP", 1, {}, () => ({ dan: "DAN_2" }), log);

		t.strictSame(res, { dan: "DAN_2" });

		t.end();
	});

	t.test("Should call static handlers if there is one", async (t) => {
		const res = await CalculateUGPTClasses(
			"gitadora",
			"Dora",
			1,
			{
				naiveSkill: 9000,
			},
			null,
			log,
		);

		t.strictSame(res, { colour: "RAINBOW" });

		t.end();
	});

	t.end();
});

t.test("#ProcessClassDeltas", (t) => {
	t.beforeEach(ResetDBState);

	t.test("Should return improved classes from null", async (t) => {
		const res = await ProcessClassDeltas("iidx", "SP", { dan: "KAIDEN" }, null, 1, log);

		t.strictSame(res, [
			{
				game: "iidx",
				set: "dan",
				playtype: "SP",
				old: null,
				new: "KAIDEN",
			},
		]);

		t.end();
	});

	t.test("Should return improved classes from null class", async (t) => {
		const res = await ProcessClassDeltas(
			"iidx",
			"SP",
			{ dan: "KAIDEN" },
			{ classes: {} } as UserGameStats,
			1,
			log,
		);

		t.strictSame(res, [
			{
				game: "iidx",
				set: "dan",
				playtype: "SP",
				old: null,
				new: "KAIDEN",
			},
		]);

		t.end();
	});

	t.test("Should return improved classes", async (t) => {
		const res = await ProcessClassDeltas(
			"iidx",
			"SP",
			{ dan: "KAIDEN" },
			{ classes: { dan: "CHUUDEN" } } as unknown as UserGameStats,
			1,
			log,
		);

		t.strictSame(res, [
			{
				game: "iidx",
				set: "dan",
				playtype: "SP",
				old: "CHUUDEN",
				new: "KAIDEN",
			},
		]);

		t.end();
	});

	t.test("Should not return identical classes", async (t) => {
		const res = await ProcessClassDeltas(
			"iidx",
			"SP",
			{ dan: "KAIDEN" },
			{ classes: { dan: "KAIDEN" } } as unknown as UserGameStats,
			1,
			log,
		);

		t.strictSame(res, []);

		t.end();
	});

	t.test("Should not return worse classes if the class isn't downgradable", async (t) => {
		const res = await ProcessClassDeltas(
			"iidx",
			"SP",
			{ dan: "DAN_10" },
			{ classes: { dan: "KAIDEN" } } as unknown as UserGameStats,
			1,
			log,
		);

		t.strictSame(res, []);

		t.end();
	});

	t.test("Should return worse classes if the class is downgradable", async (t) => {
		const res = await ProcessClassDeltas(
			"sdvx",
			"Single",
			{ vfClass: "DANDELION_I" },
			{ classes: { vfClass: "DANDELION_II" } } as unknown as UserGameStats,
			1,
			log,
		);

		t.strictSame(res, [
			{
				game: "sdvx",
				set: "vfClass",
				playtype: "Single",
				old: "DANDELION_II",
				new: "DANDELION_I",
			},
		]);

		t.end();
	});

	t.end();
});
