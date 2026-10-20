# Stabilization Plan

## P0 — security, data loss, or broken core workflow

1. Add a direct concurrent-rescheduling API race test after investigating the availability/confirmation edge case observed while constructing it.
2. Add browser-level verification for two-session Booking and mobile use. API integration now verifies cookie sessions, origin protection, isolation, service edits, break exclusion, rescheduling, and concurrent confirmation conflicts.
3. Manually verify the complete ProofFlow creator/client feedback flow in separate browser sessions, including previews/downloads, mobile layout, invalid links, revocation, and current-version approval. API integration now covers token-scoped comments, image favorites, revisions, versions, and approvals; browser automation is not configured.
4. Manually verify SpendTrack IndexedDB receipt persistence and complete backup/restore in a real browser.
5. Perform a two-browser-session ProofFlow review-link/revocation check; automated browser coverage is not configured.

## P1 — Version 1 required functionality

1. Booking: complete browser acceptance verification and optional local import preview; provider service editing, break UI, rescheduling, public `/book/:slug`, and database-backed availability are implemented locally.
2. SpendTrack: complete browser-level receipt/backup verification; local Version 1 implementation and unit tests are in place.
3. ProofFlow: complete manual browser acceptance testing. The non-destructive `003_versioning.sql` indexes and disposable PostgreSQL API integration coverage are complete.
4. Add browser-level tests for each declared core workflow.

## P2 — usability and polish

1. Extract shared form/card/empty-state components.
2. Add accessible validation messages and keyboard/focus review.
3. Add true weekly/monthly Booking calendar views and editable breaks.
