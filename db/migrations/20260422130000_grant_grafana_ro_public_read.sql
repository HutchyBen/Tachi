-- Grafana local-dev role (see dev/postgres-init.sql): init runs before migrations, so
-- GRANT SELECT ON ALL TABLES saw no tables; default privileges can also miss edge cases.
-- Re-apply read access to all existing objects; no-op when grafana_ro is absent.
DO $grant$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grafana_ro') THEN
		EXECUTE 'GRANT USAGE ON SCHEMA public TO grafana_ro';
		EXECUTE 'GRANT SELECT ON ALL TABLES IN SCHEMA public TO grafana_ro';
		EXECUTE 'GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO grafana_ro';
	END IF;
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grafana_ro')
		AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tachi') THEN
		EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE tachi IN SCHEMA public GRANT SELECT ON TABLES TO grafana_ro';
		EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE tachi IN SCHEMA public GRANT SELECT ON SEQUENCES TO grafana_ro';
	END IF;
END
$grant$;
