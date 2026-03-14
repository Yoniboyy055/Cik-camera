# GrandProof Domain Transition Checklist

## Goal
Move traffic from the legacy deployment domain to a GrandProof hostname with minimal risk and clear rollback.

## Current State
- Vercel project renamed to `grandproof-camera`.
- Legacy domain currently in use: `cik-camera.vercel.app`.
- New project default domain: `grandproof-camera.vercel.app`.

## Phase 1: Preparation
1. Verify production health on both domains:
   - `https://cik-camera.vercel.app/api/health`
   - `https://grandproof-camera.vercel.app/api/health`
2. Confirm environment variables are identical for production.
3. Confirm Supabase and storage bucket access from the new domain.
4. Confirm login, capture upload, supervisor review, and report export on the new domain.

## Phase 2: Platform Settings
1. In Vercel dashboard, open project `grandproof-camera`.
2. Add desired production custom domain (example: `app.grandproof.com`).
3. Keep both `cik-camera.vercel.app` and `grandproof-camera.vercel.app` active during transition.
4. Set the new custom domain as primary when smoke tests pass.

## Phase 3: DNS Cutover
1. Create required DNS records from Vercel domain setup:
   - `CNAME app -> cname.vercel-dns.com` (or provider-specific target)
2. Lower DNS TTL before cutover (e.g., 300 seconds).
3. Wait for SSL certificate provisioning and green status in Vercel.
4. Re-run full smoke test suite against custom domain.

## Phase 4: Application Config
1. Update local and deployment env references:
   - `APP_URL=grandproof-camera.vercel.app` (or custom domain)
2. Update any callback/allowlist URLs (if added later for auth providers).
3. Update API clients, mobile wrappers, and external integrations to new hostname.

## Phase 5: Verification
1. Confirm these workflows on new domain:
   - Worker capture flow
   - Supervisor capture flow
   - Evidence hash and capture source persistence
   - Offline queue and sync
   - Report/evidence export
2. Monitor Vercel logs and Supabase logs for 24 hours.
3. Track error rate, auth failures, and upload failures.

## Phase 6: Decommission Legacy Hostname
1. Keep legacy hostname live for a grace period (recommended 7-14 days).
2. Optionally configure redirects from old hostname to new hostname.
3. Announce end-of-support date for old URL.
4. Remove legacy references from docs and scripts.

## Rollback Plan
1. If critical errors occur, switch primary domain back in Vercel.
2. Keep previous stable deployment promoted and ready.
3. Revert env changes related to hostname.
4. Re-run smoke tests on legacy domain before reopening traffic.

## Success Criteria
- 100% core workflows pass on GrandProof hostname.
- No elevated auth/upload/report errors after cutover.
- Legacy domain has no active dependencies remaining.
