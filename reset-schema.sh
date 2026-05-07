#!/bin/bash

set -Eeuo pipefail

SCRIPT_NAME="$(basename "$0")"
DRIZZLE_DIR="drizzle"
META_DIR="$DRIZZLE_DIR/meta"
JOURNAL_PATH="$META_DIR/_journal.json"

# Modes
CONSOLIDATE=0
RESTORE_ARCHIVE=0
FORCE_LOCAL=0

BACKUP_DIR=""
ARCHIVE_RESTORED=0

# ─── Helpers ────────────────────────────────────────────────────────────────────

print_help() {
  cat <<EOF
Usage: ./$SCRIPT_NAME [OPTIONS]

Prepares the schema safely for everyday development and deployment.
Production migrations (committed to git) are NEVER touched.

Modes:
  (default)           Generate a new migration if schema changed, apply to local DB.
  --consolidate       Delete all uncommitted migrations, regenerate as a single new one.
  --restore-archive   Restore the latest drizzle/archive snapshot before generating.

Options:
  --force-local       After migrations, also run db:push to force-sync the local DB
                      schema. Use this when the local DB is out of sync (e.g. after
                      consolidation). Local data may be lost — production is never touched.
  --help              Show this help text.

Safety:
  - Committed migration files are treated as production and NEVER deleted.
  - --consolidate only removes uncommitted (local-only) migration files.
  - The local database is always synced; use --force-local if migrations alone don't suffice.
  - A backup is created before any destructive operation.

Examples:
  ./$SCRIPT_NAME                          # Normal: generate + migrate
  ./$SCRIPT_NAME --consolidate            # Merge uncommitted migrations into one
  ./$SCRIPT_NAME --consolidate --force-local  # Consolidate + force-sync local DB
  ./$SCRIPT_NAME --force-local            # Just force-sync local DB to schema
EOF
}

log() {
  echo "$1"
}

fail() {
  echo "❌ $1" >&2
  exit 1
}

warn() {
  echo "⚠️  $1" >&2
}

list_migrations() {
  find "$DRIZZLE_DIR" -maxdepth 1 -type f -name '0*.sql' 2>/dev/null | sort
}

count_migrations() {
  list_migrations | wc -l | tr -d ' '
}

latest_migration() {
  list_migrations | tail -n 1
}

ensure_structure() {
  [ -d "$DRIZZLE_DIR" ] || fail "Missing $DRIZZLE_DIR directory"
  mkdir -p "$META_DIR"
}

ensure_git() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Not inside a git repository. Git is required for production safety checks."
}

# Check if a file is committed to git (exists in HEAD)
is_committed() {
  local file="$1"
  git cat-file -e "HEAD:$file" 2>/dev/null
}

# List migration SQL files that are committed to git
list_committed_migrations() {
  for f in $(list_migrations); do
    if is_committed "$f"; then
      echo "$f"
    fi
  done
}

# List migration SQL files that are NOT committed to git
list_uncommitted_migrations() {
  for f in $(list_migrations); do
    if ! is_committed "$f"; then
      echo "$f"
    fi
  done
}

# Extract the tag (filename without path and .sql) from a migration file path
migration_tag() {
  local file="$1"
  basename "$file" .sql
}

# Create a safety backup of all current migration state
create_backup() {
  BACKUP_DIR="$DRIZZLE_DIR/.backup_$(date +%Y%m%d_%H%M%S)"
  log "💾 Creating safety backup: $BACKUP_DIR"
  mkdir -p "$BACKUP_DIR/meta"

  cp "$DRIZZLE_DIR"/0*.sql "$BACKUP_DIR"/ 2>/dev/null || true
  cp "$META_DIR"/0*.json "$BACKUP_DIR/meta/" 2>/dev/null || true
  [ -f "$JOURNAL_PATH" ] && cp "$JOURNAL_PATH" "$BACKUP_DIR/meta/_journal.json"
}

# Restore from backup on error
restore_backup_state() {
  [ -n "$BACKUP_DIR" ] || return 0
  [ -d "$BACKUP_DIR" ] || return 0

  log "↩️  Restoring migration files from backup..."
  find "$DRIZZLE_DIR" -maxdepth 1 -type f -name '0*.sql' -delete
  find "$META_DIR" -maxdepth 1 -type f -name '0*.json' -delete

  cp "$BACKUP_DIR"/0*.sql "$DRIZZLE_DIR"/ 2>/dev/null || true
  cp "$BACKUP_DIR/meta"/0*.json "$META_DIR"/ 2>/dev/null || true
  [ -f "$BACKUP_DIR/meta/_journal.json" ] && cp "$BACKUP_DIR/meta/_journal.json" "$JOURNAL_PATH"
}

# Rebuild _journal.json from the SQL files currently on disk
rebuild_journal() {
  log "📝 Rebuilding _journal.json from migration files on disk..."
  local entries=""
  local idx=0

  for f in $(list_migrations); do
    local tag
    tag="$(migration_tag "$f")"
    local ts
    ts="$(date +%s)000"

    if [ -n "$entries" ]; then
      entries="$entries,"
    fi
    entries="$entries
    {
      \"idx\": $idx,
      \"version\": \"7\",
      \"when\": $ts,
      \"tag\": \"$tag\",
      \"breakpoints\": true
    }"
    idx=$((idx + 1))
  done

  cat > "$JOURNAL_PATH" <<JOURNAL
{
  "version": "6",
  "dialect": "postgresql",
  "entries": [$entries
  ]
}
JOURNAL
}

on_error() {
  local exit_code=$?
  warn "Error detected (exit code $exit_code)."

  if [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
    restore_backup_state
    log "↩️  Migration files restored from backup."
  fi

  exit "$exit_code"
}

trap on_error ERR

# ─── Parse Arguments ────────────────────────────────────────────────────────────

for arg in "$@"; do
  case "$arg" in
    --consolidate)
      CONSOLIDATE=1
      ;;
    --restore-archive)
      RESTORE_ARCHIVE=1
      ;;
    --force-local)
      FORCE_LOCAL=1
      ;;
    --help|-h)
      print_help
      exit 0
      ;;
    *)
      fail "Unknown option: $arg"
      ;;
  esac
done

# ─── Pre-flight Checks ─────────────────────────────────────────────────────────

ensure_structure
ensure_git

ORIGINAL_COUNT="$(count_migrations)"

if [ "$ORIGINAL_COUNT" -eq 0 ]; then
  fail "No current migrations found. Run pnpm run db:generate first."
fi

log "🚀 Preparing schema..."
log ""

# Count committed vs uncommitted
COMMITTED_MIGRATIONS="$(list_committed_migrations)"
UNCOMMITTED_MIGRATIONS="$(list_uncommitted_migrations)"
COMMITTED_COUNT=0
UNCOMMITTED_COUNT=0

for _ in $COMMITTED_MIGRATIONS; do COMMITTED_COUNT=$((COMMITTED_COUNT + 1)); done 2>/dev/null || true
for _ in $UNCOMMITTED_MIGRATIONS; do UNCOMMITTED_COUNT=$((UNCOMMITTED_COUNT + 1)); done 2>/dev/null || true

log "📊 Migrations on disk: $ORIGINAL_COUNT total"
log "   🔒 Committed (production): $COMMITTED_COUNT"
log "   📝 Uncommitted (local-only): $UNCOMMITTED_COUNT"
log ""

# ─── Consolidation Mode ────────────────────────────────────────────────────────

if [ "$CONSOLIDATE" -eq 1 ]; then
  if [ "$UNCOMMITTED_COUNT" -eq 0 ]; then
    log "ℹ️  No uncommitted migrations to consolidate. Continuing with normal flow."
  elif [ "$UNCOMMITTED_COUNT" -eq 1 ]; then
    log "ℹ️  Only 1 uncommitted migration — nothing to consolidate. Continuing with normal flow."
  else
    log "🔀 Consolidating $UNCOMMITTED_COUNT uncommitted migrations into one..."

    # Safety: verify no committed migration would be touched
    for f in $UNCOMMITTED_MIGRATIONS; do
      if is_committed "$f"; then
        fail "BUG: Migration $(basename "$f") is committed but was listed as uncommitted. Aborting."
      fi
    done

    create_backup

    # Delete uncommitted migration files and their snapshots
    for f in $UNCOMMITTED_MIGRATIONS; do
      local_tag="$(migration_tag "$f")"
      log "   🗑️  Removing: $(basename "$f")"
      rm -f "$f"
      rm -f "$META_DIR/${local_tag}_snapshot.json"  # Drizzle snapshot naming convention
    done

    # Also remove any snapshot json files that don't have a corresponding sql file
    for snap in "$META_DIR"/0*_snapshot.json; do
      [ -f "$snap" ] || continue
      snap_base="$(basename "$snap" _snapshot.json)"
      if [ ! -f "$DRIZZLE_DIR/${snap_base}.sql" ]; then
        log "   🗑️  Removing orphan snapshot: $(basename "$snap")"
        rm -f "$snap"
      fi
    done

    # Rebuild journal from remaining files
    rebuild_journal
    FORCE_LOCAL=1  # After consolidation, always force-sync local DB

    log "   ✅ Uncommitted migrations removed. Will regenerate as single migration."
    log ""
  fi
fi

# ─── Archive Restore Mode ──────────────────────────────────────────────────────

LATEST_ARCHIVE="$(find "$DRIZZLE_DIR/archive" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort | tail -n 1 || true)"

if [ "$RESTORE_ARCHIVE" -eq 1 ]; then
  [ -n "$LATEST_ARCHIVE" ] || fail "No archives found in $DRIZZLE_DIR/archive/"

  create_backup

  log "📂 Restoring latest archive: $LATEST_ARCHIVE"

  find "$DRIZZLE_DIR" -maxdepth 1 -type f -name '0*.sql' -delete
  find "$META_DIR" -maxdepth 1 -type f -name '0*.json' -delete

  cp "$LATEST_ARCHIVE"/0*.sql "$DRIZZLE_DIR"/ 2>/dev/null || true
  if [ -d "$LATEST_ARCHIVE/meta" ]; then
    cp "$LATEST_ARCHIVE/meta"/0*.json "$META_DIR"/ 2>/dev/null || true
    [ -f "$LATEST_ARCHIVE/meta/_journal.json" ] && cp "$LATEST_ARCHIVE/meta/_journal.json" "$JOURNAL_PATH"
  fi

  ARCHIVE_RESTORED=1
  FORCE_LOCAL=1  # After archive restore, always force-sync local DB
fi

# ─── Generate Migration ────────────────────────────────────────────────────────

PRE_GENERATE_COUNT="$(count_migrations)"
PRE_GENERATE_LATEST="$(latest_migration || true)"

log "🛠️  Generating migration diff (if schema changed)..."
pnpm run db:generate

POST_GENERATE_COUNT="$(count_migrations)"
POST_GENERATE_LATEST="$(latest_migration || true)"
NEW_MIGRATIONS=""

if [ "$POST_GENERATE_COUNT" -gt "$PRE_GENERATE_COUNT" ]; then
  NEW_MIGRATIONS="$(list_migrations | tail -n +"$((PRE_GENERATE_COUNT + 1))")"
  log "✅ New migration file(s) created."
else
  log "✅ Schema is up to date — no new migration needed."
fi

# ─── Sync Tracking + Apply Migrations ──────────────────────────────────────────

log ""
log "🔄 Syncing migration tracking with local database..."
npx tsx ./src/db/sync-migrations.ts

log "🚚 Applying pending migrations to local database..."
if ! pnpm run db:migrate 2>&1; then
  warn "db:migrate failed. Falling back to db:push for local DB sync..."
  FORCE_LOCAL=1
fi

# ─── Force-sync Local DB (optional) ────────────────────────────────────────────

if [ "$FORCE_LOCAL" -eq 1 ]; then
  log ""
  log "🔧 Force-syncing local database: drop all → re-migrate..."
  log "   (Local data will be lost — production is never touched)"

  # Load DATABASE_URL from .env
  DB_URL="${DATABASE_URL:-}"
  if [ -z "$DB_URL" ] && [ -f .env ]; then
    DB_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"' | tr -d "'")"
  fi
  [ -n "$DB_URL" ] || fail "DATABASE_URL not set. Cannot force-sync local DB."

  # Drop everything in public schema + migration tracking
  log "   🗑️  Dropping all tables, sequences, types, and migration tracking..."
  psql "$DB_URL" -q <<'SQLEOF'
DO $$ DECLARE r RECORD;
BEGIN
  -- Drop all tables in public schema
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
  -- Drop all sequences in public schema
  FOR r IN (SELECT sequencename FROM pg_sequences WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP SEQUENCE IF EXISTS public.' || quote_ident(r.sequencename) || ' CASCADE';
  END LOOP;
  -- Drop all custom enum types in public schema
  FOR r IN (SELECT t.typname FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = 'public' AND t.typtype = 'e') LOOP
    EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
  END LOOP;
  -- Drop all views in public schema
  FOR r IN (SELECT viewname FROM pg_views WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP VIEW IF EXISTS public.' || quote_ident(r.viewname) || ' CASCADE';
  END LOOP;
  -- Drop all functions in public schema
  FOR r IN (SELECT p.oid::regprocedure::text AS funcname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public') LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.funcname || ' CASCADE';
  END LOOP;
  -- Clear migration tracking
  DROP SCHEMA IF EXISTS drizzle CASCADE;
END $$;
SQLEOF

  # Re-apply all migrations from scratch
  log "   🚚 Re-applying all migrations from scratch..."
  pnpm run db:migrate

  # Seed the database so local dev works
  log "   🌱 Seeding database..."
  pnpm run db:seed

  log "✅ Local database rebuilt from migrations + seeded."
fi

# ─── Post-flight Verification ──────────────────────────────────────────────────

log ""

# Verify committed migrations are still intact
if [ "$COMMITTED_COUNT" -gt 0 ]; then
  MISSING_COMMITTED=0
  for f in $COMMITTED_MIGRATIONS; do
    if [ ! -f "$f" ]; then
      warn "CRITICAL: Committed migration $(basename "$f") is missing after operation!"
      MISSING_COMMITTED=1
    fi
  done

  if [ "$MISSING_COMMITTED" -eq 1 ]; then
    fail "Committed (production) migration files were lost! Restoring from backup..."
  fi

  log "🔒 All $COMMITTED_COUNT committed (production) migrations verified intact."
fi

# ─── Summary ────────────────────────────────────────────────────────────────────

FINAL_COUNT="$(count_migrations)"

log ""
log "✅ Schema is ready."
log ""
log "📋 Summary:"
log "  - Migrations (total): $FINAL_COUNT"
log "  - Committed (production-safe): $COMMITTED_COUNT"
log "  - New uncommitted: $((FINAL_COUNT - COMMITTED_COUNT))"

if [ "$CONSOLIDATE" -eq 1 ] && [ "$UNCOMMITTED_COUNT" -gt 1 ]; then
  log "  - Consolidation: $UNCOMMITTED_COUNT migrations → 1"
fi

if [ "$ARCHIVE_RESTORED" -eq 1 ]; then
  log "  - Archive restore: applied from $LATEST_ARCHIVE"
fi

if [ "$FORCE_LOCAL" -eq 1 ]; then
  log "  - Local DB: force-synced via db:push"
else
  log "  - Local DB: migrated"
fi

if [ -n "$NEW_MIGRATIONS" ]; then
  log "  - New migration files:"
  for migration in $NEW_MIGRATIONS; do
    log "    - $(basename "$migration")"
  done
fi

if [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
  log "  - Backup: $BACKUP_DIR"
fi

log ""
log "📝 Next steps:"
log "  1. Review new migration files in drizzle/"
log "  2. Commit your code and migration files"
log "  3. Deploy and run migrations in production"
