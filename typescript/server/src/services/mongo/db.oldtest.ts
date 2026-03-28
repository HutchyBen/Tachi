import type { ScoreDocument } from "tachi-common";

import ResetDBState from "#test-utils/resets";
import t from "tap";

import MONGODB_KILL from "./db";

t.test("ID field autoprojection", async (t) => {
	await ResetDBState();

	const res = await MONGODB_KILL.scores.findOne();

	t.equal(res!._id, undefined);

	const res2 = await MONGODB_KILL.scores.findOne({}, { projectID: true });

	t.not(res2!._id, undefined);

	const res3 = await MONGODB_KILL.scores.findOne({}, { projection: { scoreID: 1 } });

	t.equal(res3!._id, undefined);

	const res4 = await MONGODB_KILL.scores.findOne(
		{},
		{ projection: { scoreID: 1 }, projectID: true },
	);

	t.not(res4!._id, undefined);

	const res5 = await MONGODB_KILL.scores.findOne({}, { projection: { scoreID: 0 } });

	t.equal(res5!._id, undefined);

	const res6 = await MONGODB_KILL.scores.findOne(
		{},
		{ projection: { scoreID: 0 }, projectID: true },
	);

	t.not(res6!._id, undefined);

	t.end();
});

// Literally no fix for this? MongoDB just mutates objects you give it
// for fun, i guess.
t.test("Don't add stuff onto my objects please", async (t) => {
	const sc = { scoreID: "foo" } as unknown as ScoreDocument;

	await MONGODB_KILL.scores.insert(sc);

	t.strictSame(sc, { scoreID: "foo" }, "Shouldn't have _id attached onto it.");

	await MONGODB_KILL.scores.remove({});

	t.end();
});
