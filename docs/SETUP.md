# Setup and operations

## 1. Local development

Use Node **24** (`.nvmrc`). The development dependency also supplies a Node 24 binary for npm
scripts. This implementation was checked with 24.21.0; the original host shell used Node 26.7.0.

```sh
cd clock-in-ecic
npm ci
npm run dev
```

The application can render its login/setup state without a cloud project. It does not use fake
attendance or bypass authentication in normal development/production.

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

Playwright uses a production build with `.env.e2e` **fixture** settings and intercepts the fake
backend. It starts its own preview on `127.0.0.1:4173`; stop any existing server on that port first.
Install Chromium with `npx playwright install chromium` if missing. Always run normal `npm run build`
before deployment; the tests' fixture build is not a deployment artifact.

## 2. Rehearse the fresh database

Docker is required for the Supabase local stack. On this Mac, Docker CLI and Colima are installed;
run `colima start` first if the Docker VM is stopped.
The separate embedded PostgreSQL tests are useful evidence, but do not replace the following:

```sh
npm run db:start
npx supabase db reset --local
npm run db:test
```

Only reset the disposable **local** database. This applies all versioned SQL migrations,
including the approved school policy effective from installation. `seed.sql` is intentionally empty.
The pgTAP fixtures roll back; they are not production seeds. The shared fixture is
`supabase/tests/fixtures.inc`, inside the directory mounted by the pgTAP container.
Match `db.major_version` (currently 17)
to the new hosted project before rehearsal. Then run the independent-session check below.

## 3. Create the new Supabase project

This is the next cloud setup step. You do **not** need to create tables manually.

1. Create a **new** project in the intended organization, such as `clock-in-ecic-prod`.
2. Store its new database password privately. Keep the operational database empty.
3. Get the new project URL, project ref and publishable key from Connect/API settings.
4. Copy `.env.example` to the ignored `.env.local`:

Create this file in the `clock-in-ecic` root, next to `package.json`. Put the real project
values in **`.env.local`**, not `.env.e2e`. The latter contains fake values used only by browser
tests. `npm run dev`, `npm run build` and `npm run check:connection` use `.env.local`.
Vite loads mode-specific files separately; see [Vite environment modes](https://vite.dev/guide/env-and-mode).

```dotenv
VITE_SUPABASE_URL=https://NEW_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=NEW_PUBLIC_PUBLISHABLE_KEY
```

These are public browser settings. Keep all secret/service-role keys and passwords outside the frontend.
Only those two app settings may use `VITE_`; provided values are checked before bundling, and errors do not
print them. Vercel-generated `VITE_VERCEL_*` metadata is accepted but excluded from the browser
environment. Keep the `VITE_` prefix when adding the two Supabase settings in Vercel; hosted builds
fail with a specific message if either is missing. Restart Vite after changing configuration.

Link and inspect the **new** project explicitly:

```sh
npx supabase login
npx supabase link --project-ref NEW_PROJECT_REF
npx supabase migration list
npx supabase db push --dry-run
```

After checking the project ref, migrations and local verification, apply:

```sh
npx supabase db push
npx supabase migration list
npx supabase gen types typescript --linked --schema public > src/types/database.ts
npm run typecheck
npm run check:connection
```

`check:connection` only reads Auth settings with the public key. It changes no data and does not
certify schema or RLS. The locally generated types can be reproduced with `npm run db:types`.
Do not seed sample accounts, reuse old passwords or apply a sibling application's migrations.

The CLI link and login are separate from the browser environment file. If type generation succeeds,
you do not need to repeat it just because a later command fails. In particular, a missing-configuration
message from `check:connection` points to `.env.local`, not the generated TypeScript file.

## 4. Configure Auth

Disable public signup and anonymous sign-ins in the Supabase dashboard. Enable email/password Auth
only; staff cédulas map to `<cedula>@login.clock-in.invalid`, and administrator usernames map to `<lowercase-username>@admin.clock-in.invalid`.
The alias is not a real mailbox. Accounts must be created by the trusted script below so their
identity/profile link and session-version metadata agree. Do not use public signup or email recovery.

Set Site URL to the final HTTPS origin when available, and allow the required local origin while
testing (`http://localhost:5173`). This release has no email-based recovery redirect route. Recovery
is handled by the administrator. Use a password minimum of 12 characters to match local provisioning.

### Administrator MFA

Administrators must use a TOTP authenticator. All non-admin roles retain cédula/password sign-in. Administrators use the separate `/admin/login` username form.
The first administrator sign-in offers a QR and manual setup key; a valid six-digit code completes
enrollment and unlocks the workspace. Subsequent password sign-ins require another code.
An already verified session can survive reloads until Supabase invalidates or downgrades it.
QR secrets and entered codes stay in component memory, never in application storage or logs.
Reopening an unfinished setup lets the user replace unverified factors; verified factors are never
removed by this flow. Complete the initial setup promptly with the intended administrator.

For an existing hosted project, roll out in this order:

1. Enable **TOTP enrollment and verification** in Supabase Auth's MFA settings. The local
   `supabase/config.toml` settings do not change the hosted project. Phone MFA remains disabled.
2. Deploy the frontend containing the enrollment/verification screen.
3. Review and apply `202609210001_admin_mfa.sql`. All administrator RPCs, including `app_context`,
   and direct RLS reads now require `aal2`. Existing password-only sessions must verify MFA.
4. Deploy the updated `admin-teachers` Edge Function, which also explicitly checks `aal2` after
   authenticating the bearer token. Both backend changes are required for the full protection.
5. Verify enrollment and a fresh password login with an administrator. Confirm that direct admin
   RPC/table requests and Edge mutations fail using the pre-MFA token, while teachers still sign in.

Local Supabase needs a restart after changing Auth configuration. On a disposable stack, apply the
migrations and run `npm run db:test`, then serve `admin-teachers` locally and run
`node scripts/test-admin-local.mjs`. The integration script creates a disposable administrator,
checks password-only denial, enrolls a real TOTP factor, verifies it, and tests management with the
upgraded token. It removes its temporary accounts; it refuses non-loopback backends.

Lost-device recovery is a trusted-operator procedure, not an MFA bypass in the app:

1. Verify the administrator's identity outside the app. Disable that profile and increment its
   `session_version` before changing factors, so existing application tokens stop working.
2. Using server-side operator credentials, remove the lost factors with Supabase Auth's admin MFA
   API (`auth.admin.mfa.listFactors` / `deleteFactor`). Never put a service key in the frontend.
3. Reset the password through the trusted `scripts/admin.mjs reset-password` workflow, which keeps
   profile and Auth session versions aligned, and revoke the account's Auth sessions.
   Restore the profile's activation only when the owner
   can sign in and immediately enroll a new authenticator. The reset command preserves a disabled state.
4. Verify the new factor and confirm old tokens remain rejected. Do not remove the database MFA guard
   or substitute user-editable metadata for `aal2` during recovery.

See [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa) and
[TOTP enrollment and verification](https://supabase.com/docs/guides/auth/auth-mfa/totp).

## 5. Trusted operator credentials

The initial administrator still uses the trusted provisioning command below. Once signed in,
administrators manage teachers from **Docentes** (`/admin/docentes`). They can create accounts,
edit names/C.I./employment dates, set a new password, and remove or restore access. Blocking
access revokes current sessions and prevents new logins without requiring or changing employment
dates. Attendance history is preserved; ending employment is a separate edit to its inclusive end date.
Existing passwords cannot be displayed; the new password is visible only while being entered.

The screen requires the `admin-teachers` Supabase Edge Function and the teacher-administration
migration. After testing locally, deploy it to the explicitly verified linked project:

```sh
npx supabase db push --dry-run
npx supabase db push
npx supabase functions deploy admin-teachers --project-ref NEW_PROJECT_REF
```

The function uses Supabase's server-side environment credentials. Do not add an administrative
key to Vercel's browser variables. Its handler validates the Auth user, current administrator role,
and JWT session version before using privileged access. `verify_jwt = false` is intentional:
authorization is enforced in the handler and database, including sessions revoked by password reset.

To verify real local Auth, account changes, session revocation, and history retention:

```sh
npx supabase functions serve admin-teachers
# In another terminal, from this repository:
node_modules/node/bin/node scripts/test-admin-local.mjs
```

This integration script accepts only the loopback local stack and removes its own temporary users
and attendance. It never uses `.env.local` or the hosted operator environment.
The function serializes changes per account. If a change fails after access revocation, inspect the
inactive account and retry its edit/reset; explicitly enable access when ready. For interrupted
creation, retry **Crear docente** with the same C.I., name, and intended password. Do not run an
operator command and a web account change for the same person at the same time.

Create a private file **outside the repository**, for example a protected `clock-in-admin.env`:

```dotenv
SUPABASE_URL=https://NEW_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=NEW_ADMINISTRATIVE_SECRET
```

Set private filesystem permissions (`chmod 600` for this file and account input JSON files). Never
prefix these values with `VITE_`, place them in `src/`/`public/`, or paste passwords into shell arguments.
Run one administrative action per account at a time. The script requires every input's `project_url` to exactly match the operator environment as a
safeguard against selecting the wrong project. Run commands from `clock-in-ecic` using Node 24.

### Provision fresh administrators and teachers

Create private input JSON with this shape, replacing all placeholders:

```json
{
  "project_url": "https://NEW_PROJECT_REF.supabase.co",
  "cedula": "ACTUAL_10_DIGIT_CEDULA",
  "full_name": "Actual account holder",
  "role": "teacher",
  "employed_from": "YYYY-MM-DD",
  "password": "FRESH_PRIVATE_PASSWORD_AT_LEAST_12_CHARACTERS"
}
```

Use `"role": "admin"` for the first administrator; omit `employed_from` for admins.
Cédulas are text so leading zeros survive. The administrator verifies the actual identity document;
the application checks the ten-digit shape rather than a civil-registry record.

```sh
node --env-file=/PRIVATE/PATH/clock-in-admin.env scripts/admin.mjs provision /PRIVATE/PATH/account.json
```

Provisioning creates an inactive stable profile first, then a temporarily banned Auth identity marked
with that profile ID. It unbans the new Auth account and atomically establishes teacher eligibility
and activates the application profile. If interrupted before activation, the account cannot read or
write application data. Retry the **same private input** to resume a matching pending profile/Auth
identity. An existing active profile is rejected; an unrelated Auth identity is never silently adopted.
Check partially created resources in Supabase before changing input or deleting anything.

Deliver fresh credentials privately and remove the temporary password input when no longer needed.
No password is printed by the CLI. Keep operational accounts separate from any disposable test users.

### Roles and username administrators

Staff inputs accept `teacher`, `substitute_teacher`, `secretary`, `academic_coordinator`,
`vice_principal`, or `principal`, and require `cedula` and `employed_from`. Each role has
personal attendance and history access. The administrator account editor offers these roles.

For trusted administrator provisioning, set `role` to `admin`, provide `username`,
`full_name`, `password`, and `project_url`, and omit `cedula` and employment dates.
Usernames contain 3–64 letters, digits, or underscores and begin with a letter; they are
case-insensitive. Use the same `provision` command above. Reset/disable inputs identify
these administrators by `username` instead of `cedula`. Their sign-in page is `/admin/login`,
linked as **Entrar como administrador**. First login requires TOTP setup by the operator.
No administrator credentials belong in migrations, frontend configuration, or source files.

### Reset a forgotten password

Input JSON needs `project_url`, `cedula` and a new `password`:

```sh
node --env-file=/PRIVATE/PATH/clock-in-admin.env scripts/admin.mjs reset-password /PRIVATE/PATH/reset.json
```

The script first disables application access and increments the trusted session version, then updates
Auth and restores the prior active state. Old tokens fail RLS/RPC checks immediately. If interrupted,
the profile stays disabled; inspect it and resume provisioning with its matching role/name and fresh
password to restore access. A normally disabled account is not reactivated by password reset.

### Disable an account

Input JSON needs `project_url`, `cedula`, and `employed_until` for a teacher:

```sh
node --env-file=/PRIVATE/PATH/clock-in-admin.env scripts/admin.mjs disable /PRIVATE/PATH/disable.json
```

The employment end date is inclusive. Set it accurately; do not place it before existing attendance.
Disabling prevents application access, ends future report eligibility and bans Auth. History remains.
If a step fails, access stays disabled; fix the input and retry. Do not delete teacher/profile rows.

## 6. Generate the new school QR

Input JSON:

```json
{
  "project_url": "https://NEW_PROJECT_REF.supabase.co",
  "label": "Acceso principal ECIC",
  "output_svg": "/PRIVATE/PATH/ecic-school-qr.svg"
}
```

```sh
node --env-file=/PRIVATE/PATH/clock-in-admin.env scripts/admin.mjs checkpoint /PRIVATE/PATH/checkpoint.json
```

The script writes a printable QR SVG, then activates its hashed payload in an atomic database call.
Print the SVG only after success. Save the printed checkpoint UUID in the private input as `id` for
future rotation; reusing that ID invalidates the old QR immediately. If initial setup fails after the
file is written, the file is not ready to print; inspect the checkpoint state and rerun.

Keep the SVG out of `src/`, `public/` and the repository. A static QR can be photographed/copied; this
first release does not claim physical-presence assurance. Use the newly generated QR only.

## 7. Test the live integration before launch

Use the full local stack and disposable accounts first:

- Fresh teacher/admin login, reload/session restoration, logout and different-account login.
- Direct PostgREST: own-row visibility, cross-teacher denial, role-spoof denial, no direct event writes.
- Active/inactive accounts and password-reset revocation of an existing browser session.
- Exact opening/closing instants and late justification limits using **local-only** fixtures.
- Two independent PostgreSQL/API sessions submit the same teacher/date/state simultaneously:
  identical UUID/payload yields the same event; different UUIDs yield one success and one stale-state
  rejection. Repeat across a cutoff while one transaction waits for the profile lock.
- Simulate a lost HTTP response and reconcile the original request UUID; change its payload and verify rejection.
- Correct global totals over several report pages, unmatched entry notices, employment dates and holidays.

Do not add a browser-accessible clock override to test time windows. Remove only disposable test
accounts/events in the test environment. Run ordinary hosted smoke checks over HTTPS with fresh
nonoperational accounts before the operational start date.

## 8. Create the fresh Vercel project

Import this app's intended Git repository as a **new** project. Do not reuse the retired deployment.

| Setting | Value |
| --- | --- |
| Framework / Node | Vite / Node 24 |
| Root | `.` for this app repository; `clock-in-ecic` only if importing its parent repository |
| Install / Build / Output | `npm ci` / `npm run build` / `dist` |
| Production environment | The two new public Supabase values |

Configure Preview separately, preferably with a test backend. `vercel.json` contains the SPA fallback.
After deployment, record the HTTPS URL, set Supabase Auth's Site URL, and verify direct refresh of
`/jornada`, `/historial`, `/admin`, `/admin/docentes` and `/admin/avisos` plus static asset content types. Role guards route
users correctly; the backend is responsible for authorization.

### Browser security headers

`vercel.json` applies CSP, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, and
`Permissions-Policy: camera=(self), microphone=(), geolocation=()` to every path.
CSP blocks inline scripts, JavaScript evaluation, plugins, embedded frames, and all framing of this app
(`frame-ancestors 'none'`). Camera access still requires the user's permission over HTTPS.

The resource exceptions are Google Fonts styles/fonts, HTTPS requests to `*.supabase.co`,
data images, and blob workers used by the QR decoder. Inline **style attributes** support React's
dynamic progress/timeline/scanner styles; inline scripts and style elements remain blocked.
The synchronous `/theme-init.js` preserves the saved theme before first paint.
The Supabase wildcard supports separate production/preview projects. If using a custom Supabase
domain or a local backend with preview, explicitly update `connect-src` for that origin; deployments
with fixed backends can narrow it to their exact project origins. Do not add broad `https:` or
`unsafe-inline` script allowances to resolve a blocked resource.

`npm run preview` uses these same headers, and `npm run test:e2e` tests the built app under CSP.
Vite's development server keeps its HMR behavior. After deploying, inspect response headers on `/`,
`/admin/docentes`, and an asset URL, and check the browser console for CSP violations while logging in,
switching themes, exporting reports, and scanning a QR. Local tests do not verify Vercel's deployed headers.
See [MDN's CSP guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP) and
[camera permissions policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/camera).

Check the camera on actual Android/iPhone devices over HTTPS: allow/deny permission, valid/invalid QR,
front/back camera behavior, closing the scanner, navigation, and window expiration. If reusing an old
origin, retire any old app-owned service worker/caches before launch, as explained in the reset guide.

## 9. Operations and launch record

Keep backups outside the repository. Use Supabase's database backup/export tools and verify restoration
into a separate disposable project; do not use report rows as a full database backup. Document backup
frequency and retention for the selected Supabase plan before operational use.

Record the new project ref, Vercel URL, migration versions, Git revision, operating start date, initial
administrator, verification results and QR checkpoint ID in a private operations log. No production URL,
cloud connection, old-service retirement or physical-device result has been observed in this build.

## References

- [Supabase React setup](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs)
- [Supabase local CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Supabase database functions](https://supabase.com/docs/guides/database/functions)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Trusted Auth user creation](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
- [Trusted Auth user updates](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid)
- [Playwright setup](https://playwright.dev/docs/intro)
