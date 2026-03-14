-- GrandProof V2 Core Migration
-- Run this against your Supabase project via the SQL editor or CLI:
--   supabase db push
-- Compatible with Postgres 15+

-- ─── 1. Add evidence integrity column to captures ─────────────────────────────

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS evidence_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS capture_source  TEXT DEFAULT 'worker' CHECK (capture_source IN ('worker', 'supervisor'));

-- ─── 2. Add rejection reason columns to capture_packages ─────────────────────

ALTER TABLE capture_packages
  ADD COLUMN IF NOT EXISTS rejection_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason_text TEXT;

-- ─── 3. Capture audit log ─────────────────────────────────────────────────────
-- All IDs use TEXT to match the existing schema (capture_packages.id is TEXT).

CREATE TABLE IF NOT EXISTS capture_audit_log (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  package_id    TEXT        NOT NULL REFERENCES capture_packages(id) ON DELETE CASCADE,
  actor_id      TEXT        NOT NULL,
  actor_name    TEXT        NOT NULL,
  from_status   TEXT,
  to_status     TEXT        NOT NULL,
  reason_code   TEXT,
  reason_text   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_package_id ON capture_audit_log (package_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON capture_audit_log (created_at DESC);

-- ─── 4. Offline sync log ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS offline_sync_log (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  idempotency_key TEXT        UNIQUE NOT NULL,
  user_id         TEXT        NOT NULL,
  operation       TEXT        NOT NULL,
  payload         JSONB,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offline_sync_user_id   ON offline_sync_log (user_id);
CREATE INDEX IF NOT EXISTS idx_offline_sync_synced_at ON offline_sync_log (synced_at DESC);

-- ─── 5. Row Level Security ────────────────────────────────────────────────────

ALTER TABLE capture_audit_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_sync_log    ENABLE ROW LEVEL SECURITY;

-- auth.uid() returns UUID; cast to text to match existing text id columns.
CREATE POLICY "supervisors_read_audit_log" ON capture_audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::text AND role = 'supervisor')
  );

CREATE POLICY "owner_read_audit_log" ON capture_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM capture_packages cp
      WHERE cp.id = capture_audit_log.package_id AND cp.user_id = auth.uid()::text
    )
  );

CREATE POLICY "insert_own_audit_log" ON capture_audit_log
  FOR INSERT WITH CHECK (actor_id = auth.uid()::text);

CREATE POLICY "own_sync_log" ON offline_sync_log
  FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
