<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

<h1>Built with AI Studio</h1>

<p>The fastest path from prompt to production with Gemini.</p>

<a href="https://aistudio.google.com/apps">Start building</a>
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/9bbd6019-bf47-4aae-b7db-d829101ecf65

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Git Workflow

From now on, use feature branches and pull requests for all changes.

1. Create a branch from `main`.
2. Make small, focused commits.
3. Open a PR back to `main`.
4. Merge only after review and checks pass.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## Vercel + Supabase Architecture

This app is now structured for Vercel deployment:

1. Frontend: React + Vite static build from `dist`.
2. Backend: Vercel serverless API routes in `api`.
3. Database: Supabase Postgres.
4. Image storage: Supabase Storage bucket (default: `captures`).

## API Routes (Serverless)

- `POST /api/login`
- `GET /api/projects`
- `GET /api/task-templates`
- `GET /api/task-templates/:id/requirements`
- `POST /api/capture-packages`
- `GET /api/captures`
- `POST /api/captures`
- `PATCH /api/captures/:id/status`
- `PATCH /api/packages/:id/status`

## Supabase Setup

1. Create a Supabase project.
2. Run SQL from `supabase/schema.sql` in the SQL editor.
3. Create a public storage bucket named `captures` (or set `SUPABASE_STORAGE_BUCKET`).

## Environment Variables

Set these in Vercel Project Settings:

- `GEMINI_API_KEY`
- `VITE_MAPBOX_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET` (optional, defaults to `captures`)

## Local Development

For frontend only:

- `npm run dev`

For full Vercel-like frontend + API:

- `npm run dev:vercel`

## Deployment Checklist

1. Confirm `supabase/schema.sql` has been executed.
2. Confirm storage bucket exists and is public.
3. Add all required environment variables in Vercel.
4. Run `npm run build` successfully.
5. Deploy to Vercel and verify:
   - worker login
   - project/template loading
   - capture package creation
   - capture upload to storage
   - supervisor review/status updates
   - report generation
