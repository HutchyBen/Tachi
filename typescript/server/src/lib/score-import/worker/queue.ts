/**
 * BullMQ score import queue (legacy). Replaced by Postgres `job_queue`.
 * The API process no longer instantiates a Redis queue; keep a no-op close for shutdown paths.
 */
export default null;

export const ScoreImportQueueEvents = null;

export async function CloseScoreImportQueue(): Promise<void> {
	// no-op (Postgres `job_queue` is used for score imports)
}
