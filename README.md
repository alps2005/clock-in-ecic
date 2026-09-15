# Clock-in ECIC

New teacher attendance app built with React, TypeScript, Vite, Tailwind and Supabase.
Spanish interface, cédula/password login, school QR attendance, personal history and admin reports.
Administrators manage teacher accounts and receive in-app notices for missed entry/exit windows.

- Monday–Friday in `America/Guayaquil`.
- Entry QR: **06:00–06:40**. Afterwards, a justification of up to **250 words** records a late arrival.
- Exit QR: **12:40–13:30**. An unmatched entry after closing produces **Salida no registrada** and an admin dashboard notice.
- Fresh accounts and database. No old data or application behavior is imported.

## Teacher administration

The admin directory uses a blue book for individual history, a yellow pencil for the
teacher edit page, and a red lock to block sign-in. Blocking preserves employment dates;
access can be restored in the edit form. Password reset and permanent account deletion
are available on the edit page. Deletion removes the login account and closes employment,
while attendance records remain available in the general admin report.

Deploy `202609150002_teacher_details.sql` and the updated `admin-teachers` Edge Function
before deploying the frontend. The new detail and history RPCs require an active admin session.

## Develop

Use Node 24 (`.nvmrc`), then:

```sh
npm ci
npm run dev
```

Without Supabase configuration the login screen displays a setup notice. To connect a **new** project,
copy `.env.example` to `.env.local` and fill in its URL and publishable key. Administrative credentials
belong in a separate private operator environment, never in Vite variables.

## Scan from a phone during development

Camera access on a phone requires trusted HTTPS. The HTTP network URL printed by `npm run dev`
(for example, `http://192.168.1.4:5173`) cannot use the camera.

Run `npm run dev:https` (requires OpenSSL). This creates local certificates and starts HTTPS on
port **5174**, alongside the existing HTTP server on port 5173. Keep both devices on the same Wi-Fi.

On an iPhone/iPad, open `http://YOUR_COMPUTER_IP:5173/__dev/ecic-root-ca.cer` in Safari, allow the
profile download, then install **ECIC Local Development CA** under **Settings → General → VPN &
Device Management**. Enable its full trust under **Settings → General → About → Certificate Trust
Settings**. Then open `https://YOUR_COMPUTER_IP:5174/`, sign in and allow camera access.
On Android, install that certificate as a CA certificate in the device's certificate/security settings.
Simply bypassing a certificate warning is not a substitute for installing the trusted certificate.

Keys stay in the Git-ignored `.certs.local` directory and cannot be downloaded through Vite.
Only the public root certificate has a development download route. Do not share the private keys.
Restart `npm run dev:https` if the computer's network IP changes; it reuses the same local CA.
Remove this local CA from the phone when local testing is finished. A production HTTPS deployment
uses a publicly trusted certificate and does not need these device setup steps.

## Verify

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm run check:connection
```

`npm test` rebuilds migrations in isolated embedded PostgreSQL and tests permissions/domain rules.
Browser tests use intercepted fixtures and a dedicated `.env.e2e` build; run the normal production
build afterwards. Full Supabase pgTAP tests require Docker (`npm run db:start`, `npm run db:test`).

## Setup and operations

- [Confirmed product rules](docs/PRODUCT_BRIEF.md)
- [Database, permissions and RPC contract](docs/DATABASE.md)
- [Supabase, accounts, QR and Vercel setup](docs/SETUP.md)
- [Verification evidence and remaining launch checks](docs/VERIFICATION.md)
- [Original build plan](docs/BUILD_PLAN.md)
- [Separate old-service retirement procedure](docs/SUPABASE_VERCEL_RESET.md)

The new Supabase project is linked and initial accounts are provisioned. See the latest verification
record for completed checks. Vercel deployment, the final HTTPS origin, physical-device camera checks,
and launch/backup arrangements remain pending.
