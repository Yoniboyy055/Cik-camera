# GRANDPROOF - Figma Workflow Blueprint

This file defines the production Figma information architecture for CIK Camera / GRANDPROOF.

## Page order

1. Foundations
2. Components
3. Authentication
4. Worker Portal
5. Supervisor Portal
6. HR / Compliance
7. Auditor
8. Reporting Pipeline
9. Admin
10. System States

## Foundations

- Tokens:
  - Color: Primary, Accent, Success, Warning, Error, Background, Surface
  - Typography: Heading XL, Heading L, Heading M, Body, Caption, Mono
  - Spacing: 4, 8, 12, 16, 24, 32, 48
- Layout grids:
  - Desktop: 12 columns
  - Mobile: 4 columns

## Components

- Buttons: Primary, Secondary, Danger, Ghost
- Input types: Text, Number, GPS, Upload
- Upload states: Idle, Uploading, Success, Failure, Expired URL
- Role badges: Owner, Supervisor, Worker, HR, Auditor
- Assignment card states: Unassigned, Assigned, Approved, Rejected, Escalated

## Core product flows

### Worker

Worker Dashboard -> Task Assigned -> Capture -> GPS -> Upload image -> Save metadata -> Submit proof

### Supervisor

Worker submission -> Supervisor queue -> Image preview -> Approve or Reject -> Status update

### HR / Compliance

Supervisor approved -> HR report archive -> PDF generation

### Auditor

Audit search -> Report timeline -> Evidence viewer -> PDF download

## Reporting pipeline UI model

Upload image -> Supabase Storage -> DB record -> Signed URL -> Deterministic PDF render

## Edge states to include

- Offline
- Camera permission denied
- GPS unavailable
- Upload failure
- Signed URL expired
- Network error
- Storage limit
- Permission error

## Developer handoff annotation format

Every frame should include:
- API endpoint
- Database table
- Storage bucket/path
- Permission requirement

Example:
- Component: Upload Photo
- API: POST /api/captures/upload-url and POST /api/captures
- Storage: captures bucket
- Database: captures
- Permission: workspace membership + assignment or supervisor role

## Device frame sizes

- Desktop: 1440 x 1024
- Tablet: 1024 x 768
- Mobile: 390 x 844

## Auto-layout and naming

- Auto-layout spacing: 16
- Container padding: 24
- Naming:
  - Page: SYSTEM / MODULE
  - Frame: ROLE / SCREEN
  - Component: UI / TYPE

## Build-first screen order

1. Worker Capture Screen
2. Upload Photo Flow
3. Supervisor Approval Screen
4. Report Viewer + PDF
5. Admin User Management
