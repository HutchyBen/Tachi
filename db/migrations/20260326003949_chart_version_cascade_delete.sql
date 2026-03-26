ALTER TABLE chart_version
    DROP CONSTRAINT chart_version_chart_id_fkey;

ALTER TABLE chart_version
    ADD CONSTRAINT chart_version_chart_id_fkey
        FOREIGN KEY (chart_id) REFERENCES chart(id) ON DELETE CASCADE;
