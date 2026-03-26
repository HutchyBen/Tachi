---
name: mongo-migration-constraints
description: Migrates server code from MongoDB to Postgres without modifying the legacy Mongo service. Never edits typescript/server/src/services/mongo/ (especially db.ts). Requires removing MONGODB_KILL imports and replacing usage with Postgres (Kysely) in migrated files. Use during Mongo-to-Postgres migration, when migrating routers/actions/utils off #services/mongo/db, or when the user says not to touch mongo/db.ts.
---

# Mongo → Postgres migration — off-limits Mongo layer

## Hard rules

1. **Do not edit** `typescript/server/src/services/mongo/db.ts` (or any file under `typescript/server/src/services/mongo/`). The Mongo service stays as-is until it is retired separately.

2. **In every file you migrate** to Postgres: **remove** `import MONGODB_KILL from "#services/mongo/db"` (and any `MONGODB_KILL` usage). Replace reads/writes with Kysely against `#services/pg/db` (and helpers in `src/lib/db-formats/` as needed).

3. **Do not** add new `MONGODB_KILL` imports to files that no longer need Mongo.

## How to migrate call sites

Follow [actions-and-pg-migration/SKILL.md](../actions-and-pg-migration/SKILL.md) for actions, routers, and the usual migration steps. Use [db-formats/SKILL.md](../db-formats/SKILL.md) for `SELECT_*` / `To*Document` shapes.

If something still truly depends on Mongo and cannot move yet, **leave that file unchanged** rather than editing `db.ts` or other mongo internals to “help” the migration.

## Quick checklist for a migrated file

- [ ] No import from `#services/mongo/db` / `./db` under `services/mongo`.
- [ ] Uses `DB` from `#services/pg/db` (or `.js` in action files per project ESM rules).
- [ ] No edits under `typescript/server/src/services/mongo/`.
