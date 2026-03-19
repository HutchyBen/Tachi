import { log } from "#lib/log/log.js";

import MONGODB_KILL from "./db";

export async function InitSequenceDocs() {
	await MONGODB_KILL.counters.remove({});

	const userWithLargestID = await MONGODB_KILL.users.findOne(
		{},
		{
			sort: {
				id: -1,
			},
		},
	);

	const largestBMSSongID = await MONGODB_KILL.songs.bms.findOne(
		{},
		{
			sort: {
				id: -1,
			},
		},
	);

	const largestPMSSongID = await MONGODB_KILL.songs.pms.findOne(
		{},
		{
			sort: {
				id: -1,
			},
		},
	);

	const Counters = [
		{
			counterName: "users",
			value: userWithLargestID ? userWithLargestID.id + 1 : 1,
		},
		{
			counterName: "bms-song-id",
			value: largestBMSSongID ? largestBMSSongID.id + 1 : 1,
		},
		{
			counterName: "pms-song-id",
			value: largestPMSSongID ? largestPMSSongID.id + 1 : 1,
		},
	];

	log.debug(
		`Setting Counters -> ${Counters.map((e) => `${e.counterName}: ${e.value}`).join(", ")}`,
	);

	await MONGODB_KILL.counters.insert(Counters);
}
