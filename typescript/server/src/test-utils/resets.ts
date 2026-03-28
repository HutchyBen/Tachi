import { log } from "#lib/log/log";
import { Env } from "#lib/setup/config";
import { SetIndexes } from "#services/mongo/indexes";

export default async function ResetDBState() {
	// not used
}

export async function SetIndexesForDB() {
	await ResetDBState();
	const url = `${Env.MONGO_URL}/testingdb`;

	log.info(`Setting indexes for ${url}`);

	await SetIndexes(url, true);

	log.info(`Done.`);
	return true;
}
