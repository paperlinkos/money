# PaperlinkOS Micro-SaaS Platform Context

## Purpose

PaperlinkOS is the official brand for this lightweight modular monolith. Internal `northstar.*` storage keys, cookies, tables, API routes, and deployment paths remain unchanged to preserve existing data and compatibility.

## Platform workspace and subscriptions (postponed)

The shared `tools` registry owns stable tool IDs, routes, status, and guest eligibility. Entitlement utilities exist but no subscription schema, billing UI, payment flow, or access restriction is active. Unified dashboard work is explicitly postponed; do not resume it until the product owner asks.

## Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS (`apps/web`)
- API: Node.js, Express, TypeScript (`apps/api`)
- Persistent multi-user data: PostgreSQL, introduced first for account-backed appointment booking
- Local prototype data: browser `localStorage`; GearList photos use IndexedDB

## Product access model

There are two deliberate experiences:

1. A visitor can use an immediate, no-account flow where it makes sense (for example, create an invoice or event checklist).
2. A signed-in provider/business can save data securely, use it across devices, and expose a real public workflow to clients.

Browser local storage is not browser cache. It is device/browser-specific, not secure cloud storage, and may be cleared. It remains appropriate for early offline-first prototypes, but must not be presented as synced or durable account data.

## Existing products

### 1. Invoice & Quotation Maker — `/tools/invoice`

- Working browser-first product.
- Local invoices, quotations, profile, customers, PDFs, draft history, sharing.
- No accounts, payments, or backend persistence yet.

### 2. Customer Debt & Payment Tracker — `/tools/debts`

- Working browser-first product.
- Separate local data, can safely read compatible Invoice Maker customers.
- Tracks debts, repayments, reminders, CSV/JSON export.

### 3. GearList — `/tools/gear`

- Working browser-first product.
- Event packing checklists, local gear library, rental-list export, local enquiries.
- Intended direction: visitors create/share a checklist; future accounts add durable gear libraries, templates, and rental management.

### 4. Appointment & Booking Manager — `/tools/booking`

- Current UI is a browser-local prototype: services, customers, working-hours rules, appointments, conflict prevention, booking preview, backup/restore.
- The original browser-local prototype remains available and isolated from account data.
- Provider workspace: `/tools/booking/account`; public development booking pages: `/book/:slug`.
- PostgreSQL-backed provider accounts, services, working hours, blocked dates, pending requests, confirmation/cancellation/completion, and public booking requests now exist locally.
- Pending requests do not reserve a time; only confirmed appointments block availability. PostgreSQL enforces non-overlap for confirmed appointments.
- Provider workspace now supports editing/deactivating services, changing price/duration/buffer, setting day-specific regular breaks, and rescheduling pending or confirmed appointments while preserving the reference and customer record. Breaks must fit configured hours and may not overlap; settings that would invalidate a confirmed appointment are rejected.
- Booking API integration now covers service edit/deactivation, break-based availability exclusion, rescheduling, invalid-slot rejection, confirmed-overlap safety, unsafe-hours rejection, CSRF, account isolation, and logout against a disposable database. Browser verification and a direct concurrent-rescheduling race remain outstanding.

### 5. SpendTrack — `/tools/expenses`

- Browser-local Version 1 expense tracker: create, edit, duplicate, delete, search, filter, sort, projects, reports, CSV, and print.
- Receipt files (JPEG, PNG, WebP, PDF; up to 8 MB) live in IndexedDB and expense metadata lives in the existing `northstar.expenses.v1` local-storage key, migrated compatibly to version 2.
- Versioned backups include receipt files. Restore validates before changes and supports explicit replace or merge behavior.
- SpendTrack is not account-synchronised; clearing browser data can remove records and receipts.

### 6. ProofFlow — `/tools/proof`

- Account-backed creator workspace using the existing HTTP-only session and PostgreSQL `proof_` records.
- Creators can create/open/edit projects, view client details, upload private JPEG/PNG/WebP/PDF deliverables (5 MB), preview/download them through authenticated API routes, and create review links.
- Generated review links disclose their plaintext token only once in the creator browser; stored records contain token hashes. Link metadata shows creation and expiry only.
- Uploads currently create separate deliverables; replacement uploads/version-history controls remain unfinished.
- Creators can now view link creation/expiry/status and revoke active links. Revocation is owner-scoped and immediately denies the token at both public project and public-file endpoints.
- Public `/review/:token` is a separate, login-free read-only page that renders only token-authorized project data and files. Browser acceptance testing remains outstanding.
- Public reviewers can identify themselves with a review-link-scoped HTTP-only participant cookie, add version-specific comments, select/unselect shared images as favorites, and request changes for a specific version. These actions use the existing token-scoped ProofFlow API rather than mock client data.
- The creator project view now includes a PostgreSQL-backed feedback panel for comments, unique image-favorite counts, and open/addressed revision requests. A creator can mark only their own open request as addressed; requests remain in history.
- ProofFlow creator and public feedback interfaces were reformatted into smaller readable React sections. A real disposable-PostgreSQL API integration suite now verifies ownership isolation, private/public file scope, review-token expiration/revocation, participants, comments/favorites/revisions, sequential concurrent replacement uploads, stale approval rejection, approval history, and overlapping approval/upload behavior. Browser verification remains manual because no browser runner is installed.
- ProofFlow deliverables now support immutable replacement versions: a creator uploads a new version to the same deliverable, prior files and version-specific feedback remain available to the creator, and public review pages expose only the current version. Version allocation locks the deliverable row inside a PostgreSQL transaction.
- A participant can explicitly approve only the current shared version. Approval is version-specific and participant-specific; older approvals remain in creator history as superseded after a replacement upload. This is an application review acknowledgement, not a legal electronic signature.
- `apps/api/src/modules/proof/db/003_versioning.sql` adds only supporting indexes and was applied locally on 2026-10-20 (`CREATE INDEX` × 2). It does not alter or delete existing ProofFlow data.

## Booking backend foundation

Added server-side building blocks in `apps/api`:

- `POST /api/auth/register` creates a provider account and business booking slug.
- `POST /api/auth/login` returns an opaque bearer token.
- `GET /api/booking/services` lists the signed-in provider's services.
- `POST /api/booking/services` creates a provider-owned service.
- `GET /api/public/book/:slug/services` lists active services for a public provider booking page.
- Passwords are hashed using Node `scrypt`; session tokens are hashed before storage.
- PostgreSQL migration: `apps/api/src/modules/booking/db/001_booking.sql`.
- Data tables use `booking_` prefixes, so this module can later be extracted.

The current web UI does **not** yet use this API. Do not put `DATABASE_URL`, `SESSION_SECRET`, or other secrets in `VITE_*` frontend variables.

## Local development

```bash
npm run dev
npm run check
npm test
npm run build
```

For API-backed booking development, install/run PostgreSQL locally, set `DATABASE_URL` and `SESSION_SECRET` in `.env`, then run:

```bash
psql "$DATABASE_URL" -f apps/api/src/modules/booking/db/001_booking.sql
```

## Next agreed work

1. Perform manual two-browser-session and mobile verification of the account-backed booking flow.
2. Add a dedicated concurrent-rescheduling database test after resolving the observed availability/confirmation edge case in its attempted race scenario.
3. Add a safe, optional local-record import preview.
4. Keep Booking data local to this Mac until deployment is deliberately approved.
5. Manually verify SpendTrack receipt preview/download, backup restore, and mobile workflow in a browser.

## Guardrails

- Work locally unless the user explicitly requests deployment.
- Do not alter or break existing tools while adding products.
- Do not add authentication/payments to browser-first products until the product requires it.
- Keep modules isolated; do not directly couple tool internals.
- Run TypeScript checks, tests, and a production build after meaningful implementation work.
- Keep this file updated when product direction, architecture, or implementation status materially changes.

## Verified audit status (2026-10-20)

See `PLATFORM_AUDIT.md` and `STABILIZATION_PLAN.md`. PostgreSQL 17 is running locally with a dedicated `paperlinkos` database. Booking and ProofFlow API integration flows have been exercised against separate disposable test databases; manual browser end-to-end/mobile verification remains outstanding. SpendTrack is partial and has no receipt support.
