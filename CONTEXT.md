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
- Playwright verification creates invoices on desktop and narrow mobile, verifies calculated total rendering, saves/reopens drafts, inspects generated PDF text for customer, line item, and total, and verifies the download fallback when Web Share is unavailable. A desktop print-layout test creates 48 line items, confirms the exported PDF has more than one page, and checks the first/last line items, business/customer details, total, and saved draft remain intact.

### 2. Customer Debt & Payment Tracker — `/tools/debts`

- Working browser-first product.
- Separate local data, can safely read compatible Invoice Maker customers.
- Tracks debts, repayments, reminders, CSV/JSON export.
- Playwright verification (desktop and narrow mobile) creates a debt, records partial and final payments, rejects an overpayment, verifies statement payment history and CSV data, and verifies persistence after refresh in isolated browser storage. It also verifies overdue versus future-due filtering and checks the copied reminder contains the real customer, description, and outstanding amount.

### 3. GearList — `/tools/gear`

- Working browser-first product.
- Event packing checklists, local gear library, rental-list export, local enquiries.
- Intended direction: visitors create/share a checklist; future accounts add durable gear libraries, templates, and rental management.
- Checklist cards now include a persisted Returned control alongside Packed, plus an editable checklist-item name. Playwright verification (desktop and narrow mobile) saves an equipment photo to IndexedDB, restores it after refresh, duplicates a checklist, edits and changes packed/returned state only in the duplicate, verifies the original remains unchanged after refresh, and opens the exported rental HTML after checking it excludes private serial/location data.

### 4. Appointment & Booking Manager — `/tools/booking`

- Current UI is a browser-local prototype: services, customers, working-hours rules, appointments, conflict prevention, booking preview, backup/restore.
- The original browser-local prototype remains available and isolated from account data.
- Provider workspace: `/tools/booking/account`; public development booking pages: `/book/:slug`.
- PostgreSQL-backed provider accounts, services, working hours, blocked dates, pending requests, confirmation/cancellation/completion, and public booking requests now exist locally.
- Pending requests do not reserve a time; only confirmed appointments block availability. PostgreSQL enforces non-overlap for confirmed appointments.
- Provider workspace now supports editing/deactivating services, changing price/duration/buffer, setting day-specific regular breaks, and rescheduling pending or confirmed appointments while preserving the reference and customer record. Breaks must fit configured hours and may not overlap; settings that would invalidate a confirmed appointment are rejected.
- Booking API integration now covers service edit/deactivation, break-based availability exclusion, pending-reschedule behavior, rescheduling, invalid-slot rejection, confirmation after an availability change, confirmed-overlap safety, concurrent rescheduling, confirmation-versus-rescheduling, settings-versus-rescheduling, unsafe-hours rejection, CSRF, account isolation, and logout against a disposable database. Public availability correctly excludes confirmed appointments. Booking mutations take a provider-scoped PostgreSQL advisory transaction lock and confirmation rechecks current availability. Dedicated Playwright browser tests now verify the provider/client flow on desktop and narrow mobile against a disposable database.

### 5. SpendTrack — `/tools/expenses`

- Browser-local Version 1 expense tracker: create, edit, duplicate, delete, search, filter, sort, projects, reports, CSV, and print.
- Receipt files (JPEG, PNG, WebP, PDF; up to 8 MB) live in IndexedDB and expense metadata lives in the existing `northstar.expenses.v1` local-storage key, migrated compatibly to version 2.
- Versioned backups include receipt files. Restore validates before changes and supports explicit replace or merge behavior.
- SpendTrack is not account-synchronised; clearing browser data can remove records and receipts.
- A receipt-upload defect was corrected: the upload handler now retains the file-input reference before awaiting IndexedDB work, avoiding a React event-currentTarget error. Playwright verification (desktop and narrow mobile) adds expenses in NGN and USD, uploads/downloads a PDF receipt, replaces it with JPEG, verifies image preview opens as a blob URL, inspects CSV content, validates backup receipt metadata, restores a backup after explicit replace confirmation, rejects invalid backup JSON without changing records, merges a distinct expense without duplicating it on repeat import, removes a receipt, and verifies persistence after refresh.

### 6. ProofFlow — `/tools/proof`

- Account-backed creator workspace using the existing HTTP-only session and PostgreSQL `proof_` records.
- Creators can create/open/edit projects, view client details, upload private JPEG/PNG/WebP/PDF deliverables (5 MB), preview/download them through authenticated API routes, and create review links.
- Generated review links disclose their plaintext token only once in the creator browser; stored records contain token hashes. Link metadata shows creation and expiry only.
- Uploads currently create separate deliverables; replacement uploads/version-history controls remain unfinished.
- Creators can now view link creation/expiry/status and revoke active links. Revocation is owner-scoped and immediately denies the token at both public project and public-file endpoints.
- Public `/review/:token` is a separate, login-free page that renders only token-authorized project data and files. Dedicated Playwright browser tests now exercise it on desktop and narrow mobile against a disposable database and isolated file storage.
- Public reviewers can identify themselves with a review-link-scoped HTTP-only participant cookie, add version-specific comments, select/unselect shared images as favorites, and request changes for a specific version. These actions use the existing token-scoped ProofFlow API rather than mock client data.
- The creator project view now includes a PostgreSQL-backed feedback panel for comments, unique image-favorite counts, and open/addressed revision requests. A creator can mark only their own open request as addressed; requests remain in history.
- ProofFlow creator and public feedback interfaces were reformatted into smaller readable React sections. A real disposable-PostgreSQL API integration suite now verifies ownership isolation, private/public file scope, review-token expiration/revocation, participants, comments/favorites/revisions, sequential concurrent replacement uploads, stale approval rejection, approval history, and overlapping approval/upload behavior. Dedicated Playwright tests additionally verify the creator-to-client versioned-review and revocation workflow on desktop and narrow mobile.
- ProofFlow deliverables now support immutable replacement versions: a creator uploads a new version to the same deliverable, prior files and version-specific feedback remain available to the creator, and public review pages expose only the current version. Version allocation locks the deliverable row inside a PostgreSQL transaction.
- A participant can explicitly approve only the current shared version. Approval is version-specific and participant-specific; older approvals remain in creator history as superseded after a replacement upload. This is an application review acknowledgement, not a legal electronic signature.
- `apps/api/src/modules/proof/db/003_versioning.sql` adds only supporting indexes and was applied locally on 2026-10-20 (`CREATE INDEX` × 2). It does not alter or delete existing ProofFlow data.

## Booking backend foundation

Added server-side building blocks in `apps/api`:

- `POST /api/auth/register` creates a provider account and business booking slug.
- `POST /api/auth/login` establishes an opaque HTTP-only session cookie; session tokens are never returned to frontend JavaScript.
- `GET /api/booking/services` lists the signed-in provider's services.
- `POST /api/booking/services` creates a provider-owned service.
- `GET /api/public/book/:slug/services` lists active services for a public provider booking page.
- Passwords are hashed using Node `scrypt`; session tokens are hashed before storage.
- PostgreSQL migration: `apps/api/src/modules/booking/db/001_booking.sql`.
- Data tables use `booking_` prefixes, so this module can later be extracted.

The Booking provider workspace and public booking page use this API; the original browser-local Booking prototype remains separate. Do not put `DATABASE_URL`, `SESSION_SECRET`, or other secrets in `VITE_*` frontend variables.

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

1. Add a safe, optional Booking local-record import preview.
2. Keep Booking data local to this Mac until deployment is deliberately approved.
3. Keep the local-tool and account browser suites running before changes to storage, authentication, uploads, exports, PDFs, or IndexedDB behavior.

## Guardrails

- Work locally unless the user explicitly requests deployment.
- Do not alter or break existing tools while adding products.
- Do not add authentication/payments to browser-first products until the product requires it.
- Keep modules isolated; do not directly couple tool internals.
- Run TypeScript checks, tests, and a production build after meaningful implementation work.
- Keep this file updated when product direction, architecture, or implementation status materially changes.

## Verified audit status (2026-10-21)

See `PLATFORM_AUDIT.md` and `STABILIZATION_PLAN.md`. PostgreSQL 17 is running locally with a dedicated `paperlinkos` database. Booking and ProofFlow API integration flows and their provider/creator-to-public Playwright flows have been exercised against separately created, disposable test databases. On 2026-10-21 the dedicated account browser suite passed 4 checks (Booking and ProofFlow on desktop and narrow mobile); TypeScript checks, 20 unit tests, both API integration suites, the 11 regular browser checks (one intentional duplicate skipped), and production builds also passed. No development database or normal browser storage was used.

## Booking notification foundation (2026-10-21)

- `apps/api/src/modules/booking/db/003_notifications.sql` has been applied to the local development database. It records Booking events in a provider-scoped notification outbox without sending email yet.
- The provider workspace now uses Booking-specific top tabs: **Overview**, **Appointments**, and **Services & availability**. Service/working-hours setup is intentionally separate from appointment handling. The site-wide header bell (not a duplicate Booking control) opens Booking notification history and takes the provider to Appointments when an event is selected.
- The bell honestly shows pending delivery records; it does not claim an email or Telegram alert has been sent. Connecting a verified Paperlink-owned sending domain, delivery worker, provider selection, and optional Telegram channel is a future deliberate milestone.
- The signed-in global header places the notification bell immediately left of a profile circle. Booking business settings (business name, booking slug, WhatsApp) live inside its workspace, and the public booking page is previewed in-app after saving rather than presented as a permanent external header action.
- Account navigation is now distinct from Booking: the global profile menu contains **Dashboard**, **My profile**, and **Sign out**. `/account` is a deliberately lightweight PaperlinkOS account home; `/profile` displays account identity; `/tools/booking/account` remains the independent Booking workspace. Business name, booking slug and WhatsApp remain Booking business settings, not a generic user profile.
- Local development API origin protection explicitly accepts `localhost`/`127.0.0.1` on ports 5173 and 5174 because Vite may select the next available local port. Production remains restricted to the configured `WEB_ORIGIN`; disposable Booking and ProofFlow API integration suites passed after this change.
- ProofFlow’s creator upload control now uses an explicit choose-then-upload interaction with visible file name/size and a disabled-until-selected Upload button. This replaces the ambiguous immediate upload behavior of the native file input; TypeScript and production web build passed afterwards.
- ProofFlow review links now require at least one uploaded deliverable both in the creator UI and API. Older links with no files display a clear client-facing empty state, and public review pages intentionally omit the normal PaperlinkOS header/footer so clients focus only on shared work. TypeScript, disposable API integration suites, and production builds passed.

## Creatives relaunch and billing (2026-10-30)

- **Positioning:** PaperlinkOS is now one product for Nigerian creatives (photographers, videographers, makeup artists, event creatives): booking link → gear checklist → client gallery → invoice and payment tracking. The homepage, pricing, dashboard, tools page and titles were rewritten around this; "Northstar" no longer appears in user-facing copy (internal keys/cookies unchanged). Revenue goal: ₦300–500k/month (≈100 Pro or ≈40 Studio subscribers).
- **Plans** (`apps/api/src/core/plans.ts`, mirrored for display in `apps/web/src/app/billing.ts`): Free (1 active client gallery), Pro ₦5,000/month (15), Studio ₦12,000/month (unlimited). One-time gallery pass ₦2,500 adds one permanent gallery slot. The only enforced limit is active ProofFlow galleries (`POST /api/proof/projects` returns 402 with `upgrade: true`). Booking and the browser-local tools stay free.
- **Archiving:** `POST /api/proof/projects/:id/archive` frees a slot and revokes the gallery's review links, so archiving cannot be used to keep extra galleries shared.
- **Billing module** (`apps/api/src/modules/billing`, migration `db/001_billing.sql`, applied locally 2026-10-30): Paystack checkout (`/api/billing/checkout`), post-redirect verification (`/api/billing/verify`, page `/billing/return`), subscription management link (`/api/billing/manage`) and a signature-verified webhook (`/api/billing/webhook`, exempt from the origin check, uses the raw request body). Payments settle exactly once (pending → success guarded in SQL); renewals are recorded by Paystack reference; plan changes disable the previous Paystack subscription; a failed renewal keeps paid access for a 3-day grace period. Without `PAYSTACK_*` env vars checkout returns 503 "Payments are not switched on yet."
- **Tests:** `scripts/billing-api-integration.mjs` (run by `npm run test:api:integration`) covers limits, gallery passes, webhook signatures, idempotency, underpayment, renewals, cancellation and cross-account verification without calling Paystack.
- **Known test debt:** the account browser suite is stale against earlier UI changes (choose-then-upload in ProofFlow, reworked Booking workspace). The Booking API concurrency test (`schedule update and reschedule`) is order-dependent and fails intermittently.
- **Not yet done:** production deployment, sending booking notifications (WhatsApp/email), deposits at booking, cloud-saved invoices. These are listed as "Coming soon" in the UI and must not be described as live.
