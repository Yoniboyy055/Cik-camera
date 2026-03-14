-- GrandProof RLS Text-User-ID Patch
-- Fixes 22P02 (invalid_text_representation) caused by auth.uid() returning UUID
-- while the project uses TEXT for all user IDs.
--
-- Root cause: auth.uid() internally casts the JWT 'sub' claim to uuid. When a
-- plain-text ID like 'worker-123' is used (real or in test simulation), the cast
-- throws 22P02. Fix: read 'sub' directly as text via auth.jwt() or current_setting.
--
-- Run this in Supabase SQL Editor (or supabase db push) AFTER the v2 core migration.

BEGIN;

-- ─── 1. Text-safe user-ID helper ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION request_user_id_text()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(
    coalesce(
      auth.jwt() ->> 'sub',
      current_setting('request.jwt.claim.sub', true)
    ), ''
  )
$$;

-- ─── 2. Patch helper functions ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION current_workspace_ids()
RETURNS SETOF TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT wm.workspace_id
  FROM workspace_memberships wm
  WHERE wm.user_id = request_user_id_text()
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
      AND wm.user_id = request_user_id_text()
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

-- ─── 3. Recreate affected policies on capture_audit_log ─────────────────────

DROP POLICY IF EXISTS "supervisors_read_audit_log" ON capture_audit_log;
CREATE POLICY "supervisors_read_audit_log" ON capture_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = request_user_id_text()
        AND role = 'supervisor'
    )
  );

DROP POLICY IF EXISTS "owner_read_audit_log" ON capture_audit_log;
CREATE POLICY "owner_read_audit_log" ON capture_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM capture_packages cp
      WHERE cp.id = capture_audit_log.package_id
        AND cp.user_id = request_user_id_text()
    )
  );

DROP POLICY IF EXISTS "insert_own_audit_log" ON capture_audit_log;
CREATE POLICY "insert_own_audit_log" ON capture_audit_log
  FOR INSERT WITH CHECK (actor_id = request_user_id_text());

-- ─── 4. Recreate affected policy on offline_sync_log ────────────────────────

DROP POLICY IF EXISTS "own_sync_log" ON offline_sync_log;
CREATE POLICY "own_sync_log" ON offline_sync_log
  FOR ALL
  USING  (user_id = request_user_id_text())
  WITH CHECK (user_id = request_user_id_text());

-- ─── 5. Recreate affected policies on workspace_assignments ─────────────────

DROP POLICY IF EXISTS "assignment_manage" ON workspace_assignments;
CREATE POLICY "assignment_manage" ON workspace_assignments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_memberships wm
      WHERE wm.workspace_id = workspace_assignments.workspace_id
        AND wm.user_id = request_user_id_text()
        AND wm.status = 'active'
        AND wm.role IN ('owner', 'admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_memberships wm
      WHERE wm.workspace_id = workspace_assignments.workspace_id
        AND wm.user_id = request_user_id_text()
        AND wm.status = 'active'
        AND wm.role IN ('owner', 'admin', 'supervisor')
    )
  );

-- ─── 6. Recreate affected policies on projects ──────────────────────────────

DROP POLICY IF EXISTS "projects_mutable" ON projects;
CREATE POLICY "projects_mutable" ON projects
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_memberships wm
      WHERE wm.workspace_id = projects.workspace_id
        AND wm.user_id = request_user_id_text()
        AND wm.status = 'active'
        AND wm.role IN ('owner', 'admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_memberships wm
      WHERE wm.workspace_id = projects.workspace_id
        AND wm.user_id = request_user_id_text()
        AND wm.status = 'active'
        AND wm.role IN ('owner', 'admin', 'supervisor')
    )
  );

-- ─── 7. Recreate affected policies on capture_packages ──────────────────────

DROP POLICY IF EXISTS "packages_insert" ON capture_packages;
CREATE POLICY "packages_insert" ON capture_packages
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT current_workspace_ids())
    AND (
      user_id = request_user_id_text()
      OR EXISTS (
        SELECT 1 FROM workspace_memberships wm
        WHERE wm.workspace_id = capture_packages.workspace_id
          AND wm.user_id = request_user_id_text()
          AND wm.status = 'active'
          AND wm.role IN ('owner', 'admin', 'supervisor')
      )
    )
  );

DROP POLICY IF EXISTS "packages_update" ON capture_packages;
CREATE POLICY "packages_update" ON capture_packages
  FOR UPDATE
  USING (
    workspace_id IN (SELECT current_workspace_ids())
    AND (
      user_id = request_user_id_text()
      OR EXISTS (
        SELECT 1 FROM workspace_memberships wm
        WHERE wm.workspace_id = capture_packages.workspace_id
          AND wm.user_id = request_user_id_text()
          AND wm.status = 'active'
          AND wm.role IN ('owner', 'admin', 'supervisor')
      )
    )
  )
  WITH CHECK (
    workspace_id IN (SELECT current_workspace_ids())
  );

-- ─── 8. Recreate affected policies on captures ──────────────────────────────

DROP POLICY IF EXISTS "captures_insert" ON captures;
CREATE POLICY "captures_insert" ON captures
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT current_workspace_ids())
    AND (
      user_id = request_user_id_text()
      OR EXISTS (
        SELECT 1 FROM workspace_memberships wm
        WHERE wm.workspace_id = captures.workspace_id
          AND wm.user_id = request_user_id_text()
          AND wm.status = 'active'
          AND wm.role IN ('owner', 'admin', 'supervisor')
      )
    )
    AND (
      project_id IS NULL OR can_act_on_project(workspace_id, project_id)
    )
  );

DROP POLICY IF EXISTS "captures_update" ON captures;
CREATE POLICY "captures_update" ON captures
  FOR UPDATE
  USING (
    workspace_id IN (SELECT current_workspace_ids())
    AND (
      user_id = request_user_id_text()
      OR EXISTS (
        SELECT 1 FROM workspace_memberships wm
        WHERE wm.workspace_id = captures.workspace_id
          AND wm.user_id = request_user_id_text()
          AND wm.status = 'active'
          AND wm.role IN ('owner', 'admin', 'supervisor')
      )
    )
  )
  WITH CHECK (
    workspace_id IN (SELECT current_workspace_ids())
    AND (project_id IS NULL OR can_act_on_project(workspace_id, project_id))
  );

COMMIT;
