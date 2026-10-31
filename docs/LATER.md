# Free for now, and what to change later

PaperlinkOS launched on free options. Each row says what happens today, when it stops being enough, and what to change.

| Area | Today (free) | Change it when | What to change |
|---|---|---|---|
| Password reset | People ask on `/forgot-password`. The request appears in the support inbox, and the owner emails a one-hour, single-use link to the account's own address. | More than a few requests a week, or customers can't wait for a person. | Create a Resend account (it has a free tier; check its current limits), verify `paperlinkos.site` by adding its DNS records in Namecheap, then set `RESEND_API_KEY` and `MAIL_FROM` in `/etc/paperlinkos.env` and restart. Links then send automatically; no code change. Add a DMARC record at the same time. |
| Sending mail from the server | Not possible: the host blocks outgoing port 25, and the domain has no DKIM or DMARC. | Do not use it. | Use the email service above instead. |
| Contact and feedback | Messages are saved to the support inbox at `/account/inbox`. Nothing notifies the owner, who must check it. | Messages start waiting too long. | Send an email alert for new messages once the email service is on. |
| WhatsApp support | Not offered. Pro now promises "Priority support". | A business WhatsApp number is ready. | Set `VITE_FEEDBACK_CONTACT_URL` to the `https://wa.me/...` link and rebuild, then restore the wording in `apps/web/src/app/billing.ts` if you want to promise it. |
| Terms and refunds | Plain-language draft at `/terms`, written without a lawyer. It does not name a registered business. | Before serious marketing, or once the business is registered. | Have a Nigerian lawyer review it and add the legal business name and address. |
| Refunds | Done by hand in the Paystack dashboard. | Refunds become regular. | Build refunds into the app. |
| Disk warning | Storage use shows at the top of the support inbox, and turns amber at 85%. Nobody is alerted unless they look. | The email service is on. | Add a daily check that emails the owner. |
| Backups | Nightly on the server, 14 days, same disk. `scripts/pull-backup.sh` copies the newest one to the owner's computer when run by hand. | There are paying customers with real work stored, or uploads outgrow the computer. | Move uploads and backups to object storage such as Cloudflare R2 or Backblaze B2, with automatic off-server copies. |
| Photo storage | The server's own disk (39 GB, shared with other projects). | About 70% full. | Move uploads to object storage, as above. |
| Changing email or password while signed in | Email can't be changed. Password changes use the reset flow. | Customers ask for it. | Build account settings that confirm the current password. |
| Sign-up email check | New accounts don't confirm their email. | The email service is on. | Add email confirmation at sign-up. Until then, an address can be claimed by someone who doesn't own it. |
| Admin access | `ADMIN_EMAILS` in `/etc/paperlinkos.env`. Only list an address with an existing account, because sign-ups aren't confirmed. | Email confirmation exists, or staff join. | Add proper staff roles. |
