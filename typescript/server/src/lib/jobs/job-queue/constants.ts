/** Canonical `job_queue.job_kind` for score import jobs. */
export const JOB_KIND_SCORE_IMPORT = "score_import" as const;

/** Matches client adminConstants and Zenith `job_queue.status` values. */
export const JOB_STATUS_QUEUED = 0;
export const JOB_STATUS_RUNNING = 1;
export const JOB_STATUS_DONE = 2;
export const JOB_STATUS_FAILED = 3;
