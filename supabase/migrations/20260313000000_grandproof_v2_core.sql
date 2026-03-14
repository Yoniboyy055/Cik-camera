-- GrandProof V2 Core Migration
-- Run this against your Supabase project via the SQL editor or CLI:
--   supabase db push
-- Compatible with Postgres 15+

-- ─── 1. Add evidence integrity + GPS columns to captures ────────────────────

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS evidence_sha256  TEXT,
  ADD COLUMN IF NOT EXISTS capture_source   TEXT DEFAULT 'worker' CHECK (capture_source IN ('worker', 'supervisor')),
  ADD COLUMN IF NOT EXISTS gps_accuracy_m   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS altitude_m       DOUBLE PRECISION;

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
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = current_schema()
      AND p.tablename = 'capture_audit_log'
      AND p.policyname = 'supervisors_read_audit_log'
  ) THEN
    EXECUTE format('DROP POLICY %I ON %I.%I', 'supervisors_read_audit_log', current_schema(), 'capture_audit_log');
  END IF;
END;
$$;

CREATE POLICY "supervisors_read_audit_log" ON capture_audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::text AND role = 'supervisor')
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = current_schema()
      AND p.tablename = 'capture_audit_log'
      AND p.policyname = 'owner_read_audit_log'
  ) THEN
    EXECUTE format('DROP POLICY %I ON %I.%I', 'owner_read_audit_log', current_schema(), 'capture_audit_log');
  END IF;
END;
$$;

CREATE POLICY "owner_read_audit_log" ON capture_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM capture_packages cp
      WHERE cp.id = capture_audit_log.package_id AND cp.user_id = auth.uid()::text
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = current_schema()
      AND p.tablename = 'capture_audit_log'
      AND p.policyname = 'insert_own_audit_log'
  ) THEN
    EXECUTE format('DROP POLICY %I ON %I.%I', 'insert_own_audit_log', current_schema(), 'capture_audit_log');
  END IF;
END;
$$;

CREATE POLICY "insert_own_audit_log" ON capture_audit_log
  FOR INSERT WITH CHECK (actor_id = auth.uid()::text);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = current_schema()
      AND p.tablename = 'offline_sync_log'
      AND p.policyname = 'own_sync_log'
  ) THEN
    EXECUTE format('DROP POLICY %I ON %I.%I', 'own_sync_log', current_schema(), 'offline_sync_log');
  END IF;
END;
$$;

CREATE POLICY "own_sync_log" ON offline_sync_log
  FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

-- ─── 6. Explicit workspace ownership model ───────────────────────────────────
-- Core rule enforced by this migration:
--   workspace owns data; membership grants visibility; assignment grants actions.

CREATE TABLE IF NOT EXISTS workspaces (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        TEXT        NOT NULL,
  slug        TEXT        UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_memberships (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id  TEXT        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT        NOT NULL CHECK (role IN ('owner', 'admin', 'supervisor', 'worker', 'auditor')),
  status        TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_memberships_workspace ON workspace_memberships(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_memberships_user ON workspace_memberships(user_id);

CREATE TABLE IF NOT EXISTS workspace_assignments (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id    TEXT        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  membership_id   TEXT        NOT NULL REFERENCES workspace_memberships(id) ON DELETE CASCADE,
  project_id      TEXT        REFERENCES projects(id) ON DELETE CASCADE,
  assignment_type TEXT        NOT NULL DEFAULT 'project' CHECK (assignment_type IN ('project', 'site', 'crew')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, membership_id, project_id, assignment_type)
);

CREATE INDEX IF NOT EXISTS idx_workspace_assignments_workspace ON workspace_assignments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_assignments_membership ON workspace_assignments(membership_id);

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id);

ALTER TABLE task_templates
  ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id);

ALTER TABLE task_template_requirements
  ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id);

ALTER TABLE capture_packages
  ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id);

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id),
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS report_state TEXT NOT NULL DEFAULT 'metadata_saved'
    CHECK (report_state IN ('uploaded_to_storage', 'metadata_saved', 'included_in_report', 'report_rendered'));

ALTER TABLE capture_audit_log
  ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id);

ALTER TABLE offline_sync_log
  ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id);

-- Initialize a default workspace and map existing rows into it.
INSERT INTO workspaces (id, name, slug)
VALUES ('ws-default', 'Default Workspace', 'default')
ON CONFLICT (id) DO NOTHING;

INSERT INTO workspace_memberships (workspace_id, user_id, role, status)
SELECT
  'ws-default',
  u.id,
  CASE
    WHEN u.role IN ('owner', 'admin', 'supervisor', 'worker', 'auditor') THEN u.role
    ELSE 'worker'
  END,
  'active'
FROM users u
ON CONFLICT (workspace_id, user_id) DO NOTHING;

UPDATE projects
SET workspace_id = 'ws-default'
WHERE workspace_id IS NULL;

UPDATE task_templates
SET workspace_id = 'ws-default'
WHERE workspace_id IS NULL;

UPDATE task_template_requirements r
SET workspace_id = COALESCE(r.workspace_id, t.workspace_id, 'ws-default')
FROM task_templates t
WHERE r.task_template_id = t.id
  AND r.workspace_id IS NULL;

UPDATE capture_packages
SET workspace_id = 'ws-default'
WHERE workspace_id IS NULL;

UPDATE captures c
SET workspace_id = COALESCE(c.workspace_id, cp.workspace_id, 'ws-default')
FROM capture_packages cp
WHERE c.package_id = cp.id
  AND c.workspace_id IS NULL;

UPDATE captures
SET workspace_id = 'ws-default'
WHERE workspace_id IS NULL;

UPDATE capture_audit_log l
SET workspace_id = cp.workspace_id
FROM capture_packages cp
WHERE l.package_id = cp.id
  AND l.workspace_id IS NULL;

UPDATE capture_audit_log
SET workspace_id = 'ws-default'
WHERE workspace_id IS NULL;

UPDATE offline_sync_log
SET workspace_id = 'ws-default'
WHERE workspace_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_workspace_id ON projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_templates_workspace_id ON task_templates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_template_req_workspace_id ON task_template_requirements(workspace_id);
CREATE INDEX IF NOT EXISTS idx_packages_workspace_id ON capture_packages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_captures_workspace_id ON captures(workspace_id);
CREATE INDEX IF NOT EXISTS idx_captures_storage_path ON captures(storage_path);
CREATE INDEX IF NOT EXISTS idx_captures_report_state ON captures(report_state);

-- ─── 7. Deterministic report artefacts ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS reports (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id    TEXT        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  package_id      TEXT        REFERENCES capture_packages(id) ON DELETE SET NULL,
  generated_by    TEXT        NOT NULL REFERENCES users(id),
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT        NOT NULL DEFAULT 'rendered' CHECK (status IN ('rendered', 'archived', 'failed')),
  pdf_storage_key TEXT,
  UNIQUE (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS report_images (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workspace_id  TEXT        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  report_id     TEXT        NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  capture_id    TEXT        NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  image_hash    TEXT,
  image_format  TEXT,
  embedded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_id, capture_id)
);

CREATE INDEX IF NOT EXISTS idx_reports_workspace_id ON reports(workspace_id);
CREATE INDEX IF NOT EXISTS idx_report_images_workspace_id ON report_images(workspace_id);
CREATE INDEX IF NOT EXISTS idx_report_images_report_id ON report_images(report_id);

-- ─── 8. RLS coverage for pooled tenancy ─────────────────────────────────────

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_template_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_images ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION current_workspace_ids()
RETURNS SETOF TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT wm.workspace_id
  FROM workspace_memberships wm
  WHERE wm.user_id = auth.uid()::text
    AND wm.status = 'active'
$$;

CREATE OR REPLACE FUNCTION can_act_on_project(target_workspace_id TEXT, target_project_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace_memberships wm
    WHERE wm.workspace_id = target_workspace_id
      AND wm.user_id = auth.uid()::text
      AND wm.status = 'active'
      AND (
        wm.role IN ('owner', 'admin', 'supervisor')
        OR EXISTS (
          SELECT 1
          FROM workspace_assignments wa
          WHERE wa.workspace_id = target_workspace_id
            AND wa.membership_id = wm.id
            AND wa.project_id = target_project_id
            AND wa.assignment_type = 'project'
        )
      )
  )
$$;

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT p.tablename, p.policyname
    FROM pg_policies p
    WHERE p.schemaname = current_schema()
      AND p.tablename IN (
        'workspaces', 'workspace_memberships', 'workspace_assignments',
        'projects', 'task_templates', 'task_template_requirements',
        'capture_packages', 'captures', 'reports', 'report_images'
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', rec.policyname, current_schema(), rec.tablename);
  END LOOP;
END;
$$;

CREATE POLICY "workspace_visible" ON workspaces
  FOR SELECT USING (id IN (SELECT current_workspace_ids()));

CREATE POLICY "membership_visible" ON workspace_memberships
  FOR SELECT USING (workspace_id IN (SELECT current_workspace_ids()));

CREATE POLICY "assignment_visible" ON workspace_assignments
  FOR SELECT USING (workspace_id IN (SELECT current_workspace_ids()));

CREATE POLICY "assignment_manage" ON workspace_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM workspace_memberships wm
      WHERE wm.workspace_id = workspace_assignments.workspace_id
        AND wm.user_id = auth.uid()::text
        AND wm.status = 'active'
        AND wm.role IN ('owner', 'admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_memberships wm
      WHERE wm.workspace_id = workspace_assignments.workspace_id
        AND wm.user_id = auth.uid()::text
        AND wm.status = 'active'
        AND wm.role IN ('owner', 'admin', 'supervisor')
    )
  );

CREATE POLICY "projects_visible" ON projects
  FOR SELECT USING (workspace_id IN (SELECT current_workspace_ids()));

CREATE POLICY "projects_mutable" ON projects
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM workspace_memberships wm
      WHERE wm.workspace_id = projects.workspace_id
        AND wm.user_id = auth.uid()::text
        AND wm.status = 'active'
        AND wm.role IN ('owner', 'admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_memberships wm
      WHERE wm.workspace_id = projects.workspace_id
        AND wm.user_id = auth.uid()::text
        AND wm.status = 'active'
        AND wm.role IN ('owner', 'admin', 'supervisor')
    )
  );

CREATE POLICY "templates_visible" ON task_templates
  FOR SELECT USING (workspace_id IN (SELECT current_workspace_ids()));

CREATE POLICY "template_requirements_visible" ON task_template_requirements
  FOR SELECT USING (workspace_id IN (SELECT current_workspace_ids()));

CREATE POLICY "packages_visible" ON capture_packages
  FOR SELECT USING (workspace_id IN (SELECT current_workspace_ids()));

CREATE POLICY "packages_insert" ON capture_packages
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT current_workspace_ids())
    AND (
      user_id = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM workspace_memberships wm
        WHERE wm.workspace_id = capture_packages.workspace_id
          AND wm.user_id = auth.uid()::text
          AND wm.status = 'active'
          AND wm.role IN ('owner', 'admin', 'supervisor')
      )
    )
  );

CREATE POLICY "packages_update" ON capture_packages
  FOR UPDATE USING (
    workspace_id IN (SELECT current_workspace_ids())
    AND (
      user_id = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM workspace_memberships wm
        WHERE wm.workspace_id = capture_packages.workspace_id
          AND wm.user_id = auth.uid()::text
          AND wm.status = 'active'
          AND wm.role IN ('owner', 'admin', 'supervisor')
      )
    )
  )
  WITH CHECK (
    workspace_id IN (SELECT current_workspace_ids())
  );

CREATE POLICY "captures_visible" ON captures
  FOR SELECT USING (workspace_id IN (SELECT current_workspace_ids()));

CREATE POLICY "captures_insert" ON captures
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT current_workspace_ids())
    AND (
      user_id = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM workspace_memberships wm
        WHERE wm.workspace_id = captures.workspace_id
          AND wm.user_id = auth.uid()::text
          AND wm.status = 'active'
          AND wm.role IN ('owner', 'admin', 'supervisor')
      )
    )
    AND (
      project_id IS NULL OR can_act_on_project(workspace_id, project_id)
    )
  );

CREATE POLICY "captures_update" ON captures
  FOR UPDATE USING (
    workspace_id IN (SELECT current_workspace_ids())
    AND (
      user_id = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM workspace_memberships wm
        WHERE wm.workspace_id = captures.workspace_id
          AND wm.user_id = auth.uid()::text
          AND wm.status = 'active'
          AND wm.role IN ('owner', 'admin', 'supervisor')
      )
    )
  )
  WITH CHECK (
    workspace_id IN (SELECT current_workspace_ids())
    AND (project_id IS NULL OR can_act_on_project(workspace_id, project_id))
  );

CREATE POLICY "reports_visible" ON reports
  FOR SELECT USING (workspace_id IN (SELECT current_workspace_ids()));

CREATE POLICY "reports_insert" ON reports
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT current_workspace_ids())
  );

CREATE POLICY "report_images_visible" ON report_images
  FOR SELECT USING (workspace_id IN (SELECT current_workspace_ids()));

CREATE POLICY "report_images_insert" ON report_images
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT current_workspace_ids())
  );

-- Supabase Storage policy helpers for workspace-scoped object paths:
-- expected object key format: workspace_id/package_id/file.jpg
CREATE OR REPLACE FUNCTION storage_object_workspace(path TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(split_part(path, '/', 1), '')
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'storage'
      AND p.tablename = 'objects'
      AND p.policyname = 'workspace_storage_read'
  ) THEN
    EXECUTE 'DROP POLICY workspace_storage_read ON storage.objects';
  END IF;
END;
$$;

CREATE POLICY "workspace_storage_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'captures'
    AND storage_object_workspace(name) IN (SELECT current_workspace_ids())
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'storage'
      AND p.tablename = 'objects'
      AND p.policyname = 'workspace_storage_write'
  ) THEN
    EXECUTE 'DROP POLICY workspace_storage_write ON storage.objects';
  END IF;
END;
$$;

CREATE POLICY "workspace_storage_write" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'captures'
    AND storage_object_workspace(name) IN (SELECT current_workspace_ids())
  );
