# Stabilization Plan

## P0 — security, data loss, or broken core workflow

1. Completed: browser-level Booking verification now covers an isolated provider/client workflow, sessions after refresh, breaks, availability, confirmation, rescheduling, service edit/deactivation, sign-out, provider isolation, and narrow mobile use. API integration continues to cover direct races and security boundaries.
3. Completed: dedicated Playwright verifies ProofFlow creator/client feedback, image/PDF upload rendering, current-version updates, approval history, invalid/revoked-link denial, and narrow mobile use. API integration continues to cover token scope, ownership, and races.
4. Completed: isolated Playwright coverage now verifies SpendTrack image preview, CSV, receipt backup/restore, invalid backup rejection, explicit replace, merge, and duplicate-safe repeated merge.
5. Completed: isolated creator and public browser contexts verify ProofFlow review-link generation, public access, version updates, approval history, revocation, and post-revocation file denial on desktop and narrow mobile.

## P1 — Version 1 required functionality

1. Booking: Version 1 acceptance is complete. Optional safe local-record import preview remains a later enhancement.
2. Completed: browser-level verification covers Invoice multi-page PDF, Debt overdue/reminder, Gear independent duplicated-checklist edits, and SpendTrack image preview, CSV, and valid/invalid merge/replace restore. The current isolated suite has 11 passing checks and one intentional desktop-only-layout skip across desktop/mobile runs.
3. ProofFlow: Version 1 acceptance is complete locally. The non-destructive `003_versioning.sql` indexes and disposable PostgreSQL API/browser coverage are complete.
4. Completed for Version 1 tools: local-tool and account-backed core workflows have Playwright coverage. Continue extending coverage only when their workflows change.

## P2 — usability and polish

1. Extract shared form/card/empty-state components.
2. Add accessible validation messages and keyboard/focus review.
3. Add true weekly/monthly Booking calendar views and editable breaks.
4. Booking notifications: the local outbox and a separate provider-facing history tab exist; add a verified sender domain and delivery worker only when email-provider configuration is approved.
