/** Matches Postgres job_queue.status values (Zenith-style). */
export const JOB_STATUS: Record<number, string> = {
	0: "Queued",
	1: "Running",
	2: "Done",
	3: "Failed",
};

export const ADMIN_PAGE_SIZE = 50;
