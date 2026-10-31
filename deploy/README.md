# Live deployment (paperlinkos.site)

The site runs on a shared VPS with other projects, so change only the paths below.

- **Web files:** `/var/www/paperlinkos-web`, built with `VITE_SITE_URL=https://paperlinkos.site npm run build:static`.
- **API:** `/opt/paperlinkos/app`, service `paperlinkos`, Node from `/opt/node22`, listening on `127.0.0.1:3001`.
- **Settings and secrets:** `/etc/paperlinkos.env`.
- **Database:** PostgreSQL database `paperlinkos`. Migrations in `apps/api/src/modules/*/db` are applied by hand, in the order listed in `scripts/run-api-integrations-disposable.mjs`.
- **Uploads:** `/var/lib/paperlinkos/uploads`.
- **Web settings:** the `paperlinkos.site` block in `/etc/nginx/sites-enabled/00-default`. Only the listed `/api/` prefixes go to this app; other paths go to the older shared service.
- **Backups:** `/etc/cron.daily/paperlinkos-backup` keeps 14 days in `/var/backups/paperlinkos`, on the same disk.

- **Support inbox:** `/account/inbox`, for accounts listed in `ADMIN_EMAILS` in `/etc/paperlinkos.env`. Free options in use, and what to change later, are in `docs/LATER.md`.
- **Copy a backup to your computer:** `scripts/pull-backup.sh`.

To release, upload the new `apps/web/dist` and `apps/api/dist`, apply any new migrations, run `npm ci --omit=dev --workspace=@platform/api --ignore-scripts` if the lockfile changed, then `systemctl restart paperlinkos`.

---

# Earlier static deployment notes (Caddy, not in use)

# Static VPS deployment (Caddy)

This project is currently deployable as a static Vite site. The invoice maker stores drafts in each visitor's browser; it does not need the Express API, PostgreSQL, Docker, or a background process in production.

Do not run these steps against a VPS until you have confirmed its operating system, the existing web-server setup, the Caddy configuration location, and the deployment user's permissions. These instructions deliberately do not assume root access or overwrite another site's configuration.

## What to confirm first

- The VPS distribution and version (for example, Ubuntu 24.04 or Debian 12).
- Whether Caddy is already installed and how its service is managed.
- Which account may write the chosen site directory, for example `/srv/northstar`.
- That ports 80 and 443 are available for this domain and point to the VPS.
- That no existing Caddy site is already using the domain.
- The Caddy service user can traverse and read the deployment directory.

Once those details are known, use the package manager and Caddy service commands appropriate to that server. Do not copy a generic `sudo` command over an unknown configuration.

## 1. Build a release locally or in CI

Set the public origin for the release. This is public SEO configuration, not a secret.

```bash
VITE_SITE_URL=https://your-domain.example ./scripts/package-static.sh
```

This checks the static frontend build and creates an archive in `artifacts/`. It also generates `robots.txt` and `sitemap.xml` with only real public pages:

- `/`
- `/tools`
- `/tools/invoice`
- `/pricing`
- `/privacy`
- `/contact`
- `/feedback`

Future tool paths are deliberately omitted from the sitemap.

## 2. Prepare Caddy safely

Review [Caddyfile.template](./Caddyfile.template) before copying it into a new dedicated Caddy site configuration. Set `DOMAIN` in Caddy's existing service environment using [caddy.env.example](./caddy.env.example) as a reference.

The template:

- serves only static files from `/srv/northstar/current`;
- uses SPA fallback for refreshes and direct nested routes;
- enables Caddy-managed HTTPS and HTTP-to-HTTPS redirect;
- sets conservative security headers;
- does **not** set a Content-Security-Policy, because none has been tested against PDF download and native sharing yet.

Validate the new Caddy configuration before reloading it. Follow the commands used by the existing Caddy installation; do not replace its whole configuration file if it hosts other applications.

## 3. Deploy an archive

Upload the generated archive using the existing approved SSH/SFTP workflow. On the VPS, as the dedicated deployment user:

```bash
mkdir -p "$HOME/northstar-release"
tar -xzf /path/to/northstar-static-YYYYMMDDTHHMMSSZ.tar.gz -C "$HOME/northstar-release"
./deploy/deploy-static.sh "$HOME/northstar-release" /srv/northstar
```

The script validates the release, copies it into `/srv/northstar/releases/<timestamp>`, then atomically swaps `/srv/northstar/current`. It keeps the prior release in `/srv/northstar/previous`. It does not delete releases, change Caddy, restart services, or touch visitor browser storage.

The static release directory contains no `.env` file or server secrets. Use a dedicated deployment account with only the permissions needed for `/srv/northstar`; do not deploy as root.

## 4. Verify before announcing

- Load `/`, `/tools`, `/tools/invoice`, `/pricing`, `/privacy`, `/contact`, and `/feedback` directly in a private browser window.
- Refresh `/tools/invoice` and confirm it remains on the invoice tool.
- Create a test invoice, save a draft, reload, preview it, and download a PDF.
- Check the mobile layout on a real phone or browser device emulator.
- Confirm HTTPS is valid and HTTP redirects to HTTPS.
- Confirm `https://your-domain.example/robots.txt` and `/sitemap.xml` use the expected domain.

## Rollback

If the new version fails post-deploy checks, as the deployment user run:

```bash
./deploy/rollback-static.sh /srv/northstar
```

This atomically restores the prior release. Re-test the public routes afterward. No server-side application data exists to roll back in the current prototype; user drafts stay in browser local storage and are unaffected by static releases.

## Reliability and operations

- Monitor Caddy access/error logs through the server's existing journal/logging setup.
- Use an external HTTPS uptime monitor for `/` and `/tools/invoice`.
- Keep an off-server copy of release archives and the Caddy configuration.
- Apply OS and Caddy security updates on a regular maintenance schedule.
- Keep firewall access limited to 80/443 publicly; restrict SSH to trusted access and key-based authentication.
- Back up future database data before introducing accounts or cloud storage. Browser local storage cannot be backed up by the VPS.
