# Clock-in ECIC

New teacher attendance app built with React, TypeScript, Vite, Tailwind and Supabase.
Spanish interface, cédula/password login, school QR attendance, personal history and admin reports.
Administrators manage teacher accounts and receive in-app notices for missed entry/exit windows.

- Monday–Friday in `America/Guayaquil`.
- Entry QR: **06:00–06:45**. Afterwards, a justification of up to **250 words** records a late arrival.
- Exit QR: **12:45–13:30**. An unmatched entry after closing produces **Salida no registrada** and an admin dashboard notice.
- Fresh accounts and database. No old data or application behavior is imported.

## Develop

Use Node 24 (`.nvmrc`), then:

```sh
npm ci
npm run dev
```

Without Supabase configuration the login screen displays a setup notice. To connect a **new** project,
copy `.env.example` to `.env.local` and fill in its URL and publishable key. Administrative credentials
belong in a separate private operator environment, never in Vite variables.

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
