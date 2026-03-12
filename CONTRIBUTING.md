# Contributing Guide

## Branch Strategy

- main is always deployable.
- Never commit directly to main.
- Start work from an updated main branch.
- Create a feature branch per task.

Branch naming:

- feat/<short-description>
- fix/<short-description>
- chore/<short-description>
- docs/<short-description>
- refactor/<short-description>
- test/<short-description>

Examples:

- feat/login-camera-validation
- fix/upload-timeout

## Commit Style

Use clear, small, focused commits.

Preferred commit format:

- feat: add worker camera preview
- fix: prevent duplicate upload submit
- docs: add API endpoint notes
- refactor: simplify auth state handling
- test: add login form validation tests
- chore: update dependencies

Rules:

- One logical change per commit.
- Keep commit messages in present tense.
- Avoid mixed commits that include unrelated changes.

## Pull Request Flow

1. Sync local main.
2. Create a branch from main.
3. Make focused commits.
4. Push branch to origin.
5. Open PR into main.
6. Request review.
7. Address feedback with follow-up commits.
8. Merge after checks pass.

Recommended merge method:

- Squash and merge for most feature branches.

## PR Size and Quality

- Keep PRs small enough to review quickly.
- Include screenshots for UI changes.
- Mention risks and rollback plan for backend changes.
- Add tests for behavior changes where possible.

## Pre-PR Checklist

- App runs locally.
- No obvious console errors.
- Relevant tests pass.
- Docs updated if behavior changed.
- PR description explains why and what changed.
