import { log } from "#utils/log";
import monk from "monk";

import type { DiscordUserMapDocument } from "./documents";

import { ProcessEnv } from "../config";

log.info(`Connecting to ${ProcessEnv.mongoUrl}...`);

const monkDB = monk(ProcessEnv.mongoUrl);

monkDB
	.then(() => {
		log.info(`Database connection successful.`);
	})
	.catch((err) => {
		log.fatal(err);
		process.exit(1);
	});

const db = {
	discordUserMap: monkDB.get<DiscordUserMapDocument>("discord-user-map"),
};

export async function SetIndexes(hardReset = false) {
	log.info(`Recieved request to set indexes.`);

	if (hardReset) {
		log.warn(`Hard resetting indexes!`);
		await db.discordUserMap.dropIndexes();
	}

	await db.discordUserMap.createIndex({ discordID: 1 }, { unique: true });

	log.info(`Indexes have been set.`);
}

export default db;
