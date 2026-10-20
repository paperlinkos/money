# Platform Audit — verified locally

| Product | Implemented functionality | Missing / confirmed issues | Storage | Test coverage | Status |
|---|---|---|---|---|---|
| Invoice Maker | Local documents/customers/profile, calculations, PDF export/share | Browser-only; manual browser workflow not exercised in this audit | localStorage | calculation/number tests | Partially Working |
| Debt Tracker | Local debts/payments, customer reuse, reminders/export | Manual statement/export flow not exercised | localStorage | amount/status tests | Partially Working |
| GearList | Local gear, checklists, rental-list export | No server/account flow; manual export not exercised | localStorage + IndexedDB photos | checklist/rental utility tests | Partially Working |
| Booking Manager | Local prototype plus account-backed provider workspace, editable/deactivatable services, persisted hours/breaks, client booking requests, rescheduling, public availability, and confirmed-conflict constraint | Browser/mobile verification, local-import preview, and a direct concurrent-rescheduling race test remain | localStorage (separate) + PostgreSQL | local availability tests plus disposable PostgreSQL HTTP integration test | Partially Working |
| SpendTrack | Local expenses, editing, duplicate/delete confirmation, filters/sort, projects, separated-currency reports, CSV/print, IndexedDB receipts, and versioned backup/restore | Browser-level receipt and restore workflow still needs manual verification; no cloud sync | localStorage metadata + IndexedDB receipt files | calculation/filter unit tests | Partially Working |
| ProofFlow | Account-backed projects, private uploads, immutable versions, hashed review links, public current-version review, comments/favorites/revisions, and version-specific approval acknowledgement | Browser workflow, mobile layout, previews/downloads, and error states still need manual verification; not a legal-signature product | PostgreSQL metadata + private local files | Disposable PostgreSQL HTTP integration suite plus existing frontend unit suite | Partially Working |

## Shared findings

- Web shell footer now uses a full-height flex layout; typecheck/build verify it compiles.
- Tools are modular folders, but no shared component library exists; repeated local Input/Empty/Card components remain.
- Only Booking has PostgreSQL schema/API. PostgreSQL 17 and the project-local `paperlinkos` database are available.
- Cookie-only registration/login/session restoration/logout, origin protection, provider isolation, and concurrent confirmation conflicts were verified against a separate `paperlinkos_booking_test` database.
- Browser-local Booking records remain deliberately separate from PostgreSQL records; no automatic migration occurs.
- Local records are device-specific and can be lost when browser storage is cleared. SpendTrack backups now include IndexedDB receipt files, but should be downloaded before clearing browser data.
- ProofFlow API integration runs in `scripts/proof-api-integration.mjs`; it creates no development records and the external command removes its disposable database. No browser automation framework is installed, so manual end-to-end flows remain outstanding.
