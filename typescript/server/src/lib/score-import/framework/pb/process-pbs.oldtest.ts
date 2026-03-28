import { log } from "#lib/log/log.js";
import MONGODB_KILL from "#services/mongo/db";
import ResetDBState from "#test-utils/resets";
import { Testing511SPA, TestingIIDXSPScore } from "#test-utils/test-data";
import crypto from "crypto";
import deepmerge from "deepmerge";
import t from "tap";

import { ProcessPBs } from "./process-pbs";

t.test("#ProcessPBs", (t) => {
	t.beforeEach(ResetDBState);

	t.test("Should successfully insert a pb into the score-pb database", async (t) => {
		await MONGODB_KILL["personal-bests"].remove({});

		// scores on 511 SPA are pre-loaded into the database
		await ProcessPBs("iidx", "SP", 1, new Set([Testing511SPA.chartID]), log);

		const pbs = await MONGODB_KILL["personal-bests"].find({});

		t.equal(pbs.length, 1, "Should match the amount of PBs inserted into the DB.");

		t.end();
	});

	t.test("Should successfully insert multiple pbs into the score-pb database", async (t) => {
		await MONGODB_KILL["personal-bests"].remove({});

		await MONGODB_KILL.charts.iidx.insert([
			// @ts-expect-error lol
			deepmerge(Testing511SPA, {
				chartID: "test1",
				songID: 2,
			}),
			// @ts-expect-error lol
			deepmerge(Testing511SPA, {
				chartID: "test2",
				songID: 3,
			}),
			// @ts-expect-error lol
			deepmerge(Testing511SPA, {
				chartID: "test3",
				songID: 4,
			}),
		]);

		await MONGODB_KILL.scores.insert([
			// @ts-expect-error lol
			deepmerge(TestingIIDXSPScore, {
				chartID: "test1",
				scoreID: crypto.randomBytes(20).toString("hex"),
			}),

			// @ts-expect-error lol
			deepmerge(TestingIIDXSPScore, {
				chartID: "test2",
				scoreID: crypto.randomBytes(20).toString("hex"),
			}),

			// @ts-expect-error lol
			deepmerge(TestingIIDXSPScore, {
				chartID: "test3",
				scoreID: crypto.randomBytes(20).toString("hex"),
			}),
		]);

		await ProcessPBs(
			"iidx",
			"SP",
			1,
			new Set(["test1", "test2", "test3", Testing511SPA.chartID]),
			log,
		);

		const pbs = await MONGODB_KILL["personal-bests"].find({});

		t.equal(pbs.length, 4, "Should match the amount of PBs inserted into the DB.");

		t.end();
	});

	t.end();
});
