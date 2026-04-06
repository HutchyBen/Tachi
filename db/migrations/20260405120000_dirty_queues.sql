-- Derivation checksum on chart: a SHA-256 hex digest of the chart fields
-- that feed into scoreDeriver/scoreCalcs. When this changes, all scores
-- on the chart need re-derivation.
ALTER TABLE chart ADD COLUMN derivation_checksum TEXT;

-- Dirty queue: score mutations enqueue (user_id, chart_id) pairs that
-- need PB recalculation. Deduplication via the PK.
CREATE TABLE pb_dirty (
	user_id BIGINT NOT NULL,
	chart_id TEXT NOT NULL,
	enqueued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	PRIMARY KEY (user_id, chart_id)
);

-- Dirty queue: chart mutations (when derivation_checksum changes) enqueue
-- chart_ids whose scores need re-derivation. One row per chart.
CREATE TABLE score_rederive (
	chart_id TEXT NOT NULL PRIMARY KEY,
	enqueued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger function: on any score INSERT/UPDATE/DELETE, mark the
-- (user_id, chart_id) pair as needing PB recalculation.
CREATE FUNCTION enqueue_pb_dirty() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		INSERT INTO pb_dirty (user_id, chart_id)
		VALUES (OLD.user_id, OLD.chart_id)
		ON CONFLICT DO NOTHING;
	ELSE
		INSERT INTO pb_dirty (user_id, chart_id)
		VALUES (NEW.user_id, NEW.chart_id)
		ON CONFLICT DO NOTHING;
	END IF;
	RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER score_pb_dirty
	AFTER INSERT OR UPDATE OR DELETE ON score
	FOR EACH ROW EXECUTE FUNCTION enqueue_pb_dirty();

-- Trigger function: on chart UPDATE, if derivation_checksum changed,
-- enqueue the chart for score re-derivation.
CREATE FUNCTION enqueue_score_rederive() RETURNS trigger AS $$
BEGIN
	IF OLD.derivation_checksum IS DISTINCT FROM NEW.derivation_checksum THEN
		INSERT INTO score_rederive (chart_id)
		VALUES (NEW.id)
		ON CONFLICT DO NOTHING;
	END IF;
	RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chart_score_rederive
	AFTER UPDATE ON chart
	FOR EACH ROW EXECUTE FUNCTION enqueue_score_rederive();
