# PaperlinkOS

A lightweight modular monolith for launching a family of small paid web tools under one brand and domain.

## Account-backed Booking Manager (local development)

The Appointment & Booking Manager has a local, account-backed provider path. Use a dedicated local PostgreSQL database and apply both additive migrations before using it:

```bash
psql "$DATABASE_URL" -f apps/api/src/modules/booking/db/001_booking.sql
psql "$DATABASE_URL" -f apps/api/src/modules/booking/db/002_booking_scheduling.sql
psql "$DATABASE_URL" -f apps/api/src/modules/booking/db/003_notifications.sql
```

The provider workspace at `/tools/booking/account` supports service edits/deactivation, working hours, regular day-specific breaks, and rescheduling. A settings change is rejected if it would conflict with a confirmed appointment. Public booking availability excludes breaks and confirmed appointments; pending requests do not reserve a time.

For the disposable Booking API integration test, compile the API, create a separate test database, apply both Booking migrations, set `DATABASE_URL` to that test database, then run:

```bash
node scripts/booking-api-integration.mjs
```

Do not point this test at the development database. Playwright browser coverage is available through the dedicated disposable test runner below.

Use `DATABASE_URL` only on the API server; never place it in a `VITE_*` frontend variable. The browser-local prototype at `/tools/booking` remains separate. Providers use `/tools/booking/account`; clients use `/book/<provider-slug>` locally. Browser records are not migrated automatically.

The first release contains the public platform website, a tools directory, a working Invoice & Quotation Maker at `/tools/invoice`, a Customer Debt & Payment Tracker at `/tools/debts`, and a minimal Express API health endpoint. Authentication, payments, customer accounts, and database migrations are intentionally deferred until a tool needs them.

## Local setup

Requirements: Node.js 20.19+ (or 22.12+) and npm.

```bash
cp .env.example .env
npm install
npm run dev
```

### ProofFlow local database migration

ProofFlow uses the existing local PostgreSQL account/session database and keeps uploaded files in `private-uploads/proof` (outside public static directories). After PostgreSQL is running and `DATABASE_URL` is set in `.env`, apply its additive migrations in order:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/api/src/modules/proof/db/001_proof.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/api/src/modules/proof/db/002_feedback.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/api/src/modules/proof/db/003_versioning.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/api/src/modules/proof/db/004_protected_preview.sql
```

Protected previews use `sharp` on the API server and need a font there to draw the watermark (for example `apt install fonts-dejavu-core`). Without a font, protected images are withheld from clients rather than shown unmarked.

Replacement uploads create a new immutable version under the same deliverable. Public review links expose only the current version; the creator can still open prior versions. Client approvals are explicit, version-specific review acknowledgements, not legal electronic signatures.

Open `http://localhost:5173`. The API health endpoint is available at `http://localhost:3001/api/health`.

Other commands:

```bash
npm run check
npm test
npm run build
npm run test:e2e --workspace=@platform/web
npm run test:api:integration
npm run test:e2e:accounts
```

`npm run test:api:integration` creates and removes a uniquely named PostgreSQL test database. `npm run test:e2e:accounts` additionally starts a dedicated API and Vite server, uses separate provider/creator and public browser contexts, and stores ProofFlow uploads in a temporary directory. Both commands preserve the `paperlinkos` development database and normal browser storage.

Run ProofFlow's real API integration suite only against a disposable database, never your development database. The test runner expects the compiled API and a test `DATABASE_URL`:

```bash
npm run build --workspace=@platform/api
DATABASE_URL="postgresql://…/paperlinkos_proof_test" npm run test:proof:integration
```

The project maintainer's local verification command creates, migrates, and removes that exact disposable database before and after the run. Browser automation is available through the locally installed Google Chrome; `npm run test:e2e:accounts` uses separate authenticated and public Playwright contexts for the Booking and ProofFlow acceptance flows.

For the public product pages, visit:

- `/` — Invoice Maker landing page and tools directory
- `/tools/invoice` — the working Invoice & Quotation Maker
- `/tools/debts` — the working Customer Debt & Payment Tracker
- `/pricing` — free and proposed future plans
- `/feedback` — local copy-to-clipboard feedback form
- `/privacy` and `/contact` — public information pages

## Structure

```text
apps/
  web/                 Public website and future authenticated dashboard UI
    src/
      app/             Shared layout, routes, navigation, global styles
      modules/         One isolated frontend module per tool
      pages/           Platform-level pages
  api/                 Node HTTP API
    src/
      core/            Shared platform concerns (config, future auth/billing)
      modules/         One isolated backend module per tool
      server.ts        Composition root and HTTP routing
```

Each tool owns its own UI, API routes, business rules, and database migrations. Shared platform concerns live in `core/`, but tools must not import each other's internals.

## Adding a tool

1. Create `apps/web/src/modules/<tool-slug>/` for its screens and client logic.
2. Add one entry to `apps/web/src/modules/tools.ts`; the directory renders it automatically.
3. Create `apps/api/src/modules/<tool-slug>/` for routes and server-side business logic.
4. When persistence is required, create database migrations scoped and named for that tool, for example `apps/api/src/modules/<tool-slug>/db/001_initial.sql`. Use a tool-specific table prefix, such as `invoice_reminder_*`.

This means a tool can later be extracted by moving its module and its prefixed tables/migrations into a standalone repository. Keep cross-tool dependencies out of tool modules; communicate only through stable core interfaces when genuinely needed.

## Invoice & Quotation Maker

The first tool is browser-first by design: drafts (including an uploaded logo), business profile, and customers are stored in the browser's local storage, so there is no account or database requirement yet. It supports invoices and quotations, NGN/USD, quantities, per-line discounts, tax, automatic totals, searchable document history, PDF download, and native browser sharing where supported. If a browser cannot share a PDF file, it downloads it instead.

Local drafts are tied to the browser and device. They are not backed up or shared until cloud accounts are deliberately introduced.

Run the automated calculation and document-number tests with:

```bash
npm test
```

## Customer Debt & Payment Tracker

The debt tracker is also browser-first. It records debts and partial repayments in separate local storage, optionally reuses compatible Invoice Maker customers without changing invoice records, and keeps NGN/USD balances separate. It supports friendly reminder copy/WhatsApp links, CSV export, customer statements, and JSON backup/restore. A restore asks before replacing Debt Tracker data and never overwrites Invoice Maker data.

## Deployment shape

The current product can be deployed as static files only: build it with `npm run build:static` and serve `apps/web/dist` through Caddy with an SPA fallback to `index.html`, so direct visits to `/tools/invoice`, `/pricing`, and other routes work. Do not deploy the API yet; it has no production responsibility while documents are stored in each browser. When a backend is introduced later, run it privately (for example on `127.0.0.1`) and proxy only the required paths. PostgreSQL should only be reachable from that future API on the private server network. Set secrets in the process manager, never in the frontend build.

### VPS deployment guide

1. Install Node.js 20.19+ (or 22.12+), Nginx, and a process manager such as systemd.
2. On the VPS, install dependencies with `npm ci`, then run `npm run check`, `npm test`, and `npm run build`.
3. Run the API with a dedicated, non-root system user. Keep it bound to `127.0.0.1:3001`; only Nginx should expose public traffic.
4. Configure Nginx to serve `apps/web/dist`, proxy `/api/` to `http://127.0.0.1:3001`, and fall back to `/index.html`.

Example Nginx location blocks:

```nginx
location / {
  try_files $uri $uri/ /index.html;
}

location /api/ {
  proxy_pass http://127.0.0.1:3001;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

5. Enable HTTPS with a valid TLS certificate (for example, Certbot/Let's Encrypt), redirect HTTP to HTTPS, and renew certificates automatically.
6. Allow only ports 80/443 through the VPS firewall. Keep SSH restricted to trusted access, use key authentication, and apply security updates regularly.

`VITE_*` values are included in the frontend build and are public. Only use `VITE_FEEDBACK_CONTACT_URL` for a deliberate public contact URL. Never place database URLs, API keys, passwords, or private email credentials in any `VITE_*` variable.

For the first production tool, add a migration runner, PostgreSQL driver, authentication, and payment provider only as that tool requires them.

For the static Caddy deployment workflow, release packaging, verification checklist, and rollback process, see [deploy/README.md](./deploy/README.md).
