import { Env, TachiConfig } from "#lib/setup/config";
import { Queue, QueueEvents } from "bullmq";

const ScoreImportQueue = new Queue(`${TachiConfig.NAME} Score Import Queue`, {
	connection: { host: Env.REDIS_URL, port: 6379 },
	defaultJobOptions: {
		removeOnComplete: true,
		removeOnFail: 10, // keep the last 10 failed jobs, but start pruning beyond that.
	},
});

export default ScoreImportQueue;

export const ScoreImportQueueEvents = new QueueEvents(ScoreImportQueue.name, {
	connection: { host: Env.REDIS_URL, port: 6379 },
});

export async function CloseScoreImportQueue() {
	await ScoreImportQueueEvents.close();
	return ScoreImportQueue.close();
}
