---
name: D1 migration tracking gap
description: What to do when wrangler migration apply fails with "duplicate column" because a migration was applied manually in a previous session.
---

## Rule
When `wrangler d1 migrations apply --remote` fails with `duplicate column name: SQLITE_ERROR`, it means the migration SQL was already run directly against the DB but the `d1_migrations` table was not updated.

**Fix:** Insert a fake record into `d1_migrations` for every already-applied migration, then re-run the apply command.

```sql
INSERT OR IGNORE INTO d1_migrations (name, applied_at) VALUES
  ('017_example.sql', '2026-06-01 00:00:00');
```

Run via:
```bash
wrangler d1 execute cv-engine-db --remote --command="INSERT OR IGNORE INTO d1_migrations ..."
```

**Why:** Wrangler tracks applied migrations in a `d1_migrations` table. Manually-run SQL bypasses this table. The fix is safe — `INSERT OR IGNORE` won't overwrite already-tracked rows.

**How to apply:** Any time a wrangler migration run fails on a migration that clearly already ran (e.g. column/table exists error), check `SELECT * FROM d1_migrations` first, then backfill the missing rows.
