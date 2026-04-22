-- Fast dequeue of queued (status = 0) jobs ordered by when they are due.
CREATE INDEX job_queue_dequeue_idx
ON job_queue (scheduled_for ASC, created_at ASC)
WHERE status = 0;
