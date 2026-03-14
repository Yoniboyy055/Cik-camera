# GRANDPROOF V3 - Architecture and Audit Baseline

## Verified facts implemented in this change set

- Explicit workspace tenancy model has been added to SQL migration and schema bootstrap.
- Core API routes now resolve workspace context from membership and scope queries by workspace_id.
- Upload flow now supports signed direct-to-storage uploads through a dedicated API route.
- Frontend capture flows now upload image bytes directly to storage and submit only metadata to /api/captures.
- PDF image embedding path now fetches image bytes and embeds DataURL payloads into jsPDF, with structured logging.

## Core invariant

workspace owns data; membership grants visibility; assignment grants actions.

## Route and behavior summary

| Route | Auth | Workspace scope | Notes |
|---|---|---|---|
| POST /api/captures/upload-url | session | required | issues signed upload URL and workspace-scoped storage path |
| GET /api/captures | session | required | returns captures filtered by workspace and role |
| POST /api/captures | session | required | accepts storage_path or legacy photo_data; writes workspace_id |
| POST /api/capture-packages | session | required | writes workspace_id and validates project assignment |
| PATCH /api/packages/[id]/status | session | required | updates package and captures only within workspace |
| PATCH /api/captures/[id]/status | supervisor/admin/owner | required | updates capture/package only within workspace |
| GET /api/projects | session | required | workspace-filtered list |
| GET /api/task-templates | session | required | workspace-filtered list |
| GET /api/task-templates/[id]/requirements | session | required | workspace-filtered list |

## Storage path convention

workspace_id/package_id_or_unpacked/file-id.ext

Examples:
- ws-default/7fd8.../c9a2....jpg
- ws-default/unpackaged/f0ab....jpg

## Report determinism guarantees

- PDF generation path converts URL response bytes to DataURL before addImage.
- jsPDF image format is explicitly set based on MIME (PNG or JPEG).
- Embed success and failure are logged with capture id and source URL.

## Migration checklist

1. Run supabase migration:
   - supabase db push
2. Verify workspace tables and columns exist:
   - workspaces
   - workspace_memberships
   - workspace_assignments
   - reports
   - report_images
   - workspace_id columns on core tables
3. Verify storage object policies exist in storage.objects.

## Validation commands

- npm run lint
- npm run build

## Expected outcomes

- Large images no longer need to pass through Vercel serverless request body.
- Users in one workspace cannot read or mutate package/capture data in another workspace through API routes.
- Generated report PDFs retain images when opened offline because image bytes are embedded.

## Rollback strategy

- Disable client direct upload usage by reverting to legacy photo_data in client calls.
- Keep POST /api/captures backward compatible during rollback.
- Revert migration by applying a follow-up migration that drops new policies/tables if required.
