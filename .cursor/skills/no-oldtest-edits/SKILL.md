---
name: no-oldtest-edits
description: Treats `*.oldtest.ts` files as read-only legacy snapshots. Never edits them. Use when changing tests, game implementations, or when any path matches `*.oldtest.ts`.
---

# No edits to `*.oldtest.ts`

## Hard rule

**Do not modify** any file whose name matches `*.oldtest.ts` (for example `jubeat.oldtest.ts`). These are frozen reference tests.

## What to do instead

- Make test or implementation changes in the corresponding non-`oldtest` files (for example `*.test.ts` next to the implementation, or the main `*.ts` source).
- If behavior must be verified against old expectations, add or update tests outside `*.oldtest.ts`.

## Checklist before finishing a task

- [ ] No file edited under a `*.oldtest.ts` path.
