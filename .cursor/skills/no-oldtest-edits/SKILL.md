---
name: no-oldtest-edits
description: Legacy. `*.oldtest.ts` snapshots were removed from the Tachi server after migration to Vitest `*.test.ts`. No action needed unless oldtest files are reintroduced.
---

# Legacy note

Server tests live in `*.test.ts` under `typescript/server/src/`. The former Tap `*.oldtest.ts` tree has been deleted.

If `*.oldtest.ts` files appear again, treat them as read-only snapshots and add or change behavior only in `*.test.ts` or source files.
