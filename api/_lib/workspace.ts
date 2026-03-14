import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionUser } from './auth.js';

export interface WorkspaceContext {
  workspaceId: string;
  role: string;
  membershipId: string | null;
}

export function roleCanManageWorkspace(role: string): boolean {
  return role === 'owner' || role === 'admin' || role === 'supervisor';
}

export async function resolveWorkspaceContext(
  supabase: SupabaseClient,
  session: SessionUser,
  requestedWorkspaceId?: string | null,
): Promise<WorkspaceContext> {
  const fallbackWorkspace = requestedWorkspaceId || session.workspace_id || 'ws-default';

  const { data, error } = await supabase
    .from('workspace_memberships')
    .select('id, workspace_id, role, status')
    .eq('user_id', session.id)
    .eq('status', 'active');

  // Keep compatibility with pre-migration environments where memberships do not exist yet.
  if (error) {
    return {
      workspaceId: fallbackWorkspace,
      role: session.role,
      membershipId: null,
    };
  }

  const memberships = (data || []) as Array<{
    id: string;
    workspace_id: string;
    role: string;
    status: string;
  }>;

  const selected = requestedWorkspaceId
    ? memberships.find((row) => row.workspace_id === requestedWorkspaceId)
    : memberships.find((row) => row.workspace_id === (session.workspace_id || '')) || memberships[0];

  if (!selected) {
    return {
      workspaceId: fallbackWorkspace,
      role: session.role,
      membershipId: null,
    };
  }

  return {
    workspaceId: selected.workspace_id,
    role: selected.role || session.role,
    membershipId: selected.id,
  };
}

export async function canActOnProject(
  supabase: SupabaseClient,
  workspace: WorkspaceContext,
  projectId: string | null,
): Promise<boolean> {
  if (!projectId) return true;
  if (roleCanManageWorkspace(workspace.role)) return true;
  if (!workspace.membershipId) return false;

  const { data, error } = await supabase
    .from('workspace_assignments')
    .select('id')
    .eq('workspace_id', workspace.workspaceId)
    .eq('membership_id', workspace.membershipId)
    .eq('assignment_type', 'project')
    .eq('project_id', projectId)
    .limit(1);

  if (error) {
    return false;
  }

  return !!data?.length;
}
