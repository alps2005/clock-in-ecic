# Verification record — 2026-09-12

## Passed locally

| Check | Evidence |
| --- | --- |
| Starter baseline | Original lint and build passed before implementation. |
| TypeScript | `npm run typecheck` passed with strict application and tooling checks. |
| Lint | `npm run lint` passed. |
| Domain/configuration/embedded database | `npm test`: **15 tests passed**. Each database case rebuilds all migrations in isolated PGlite PostgreSQL. |
| Browser | `npm run test:e2e`: **20 tests passed**, desktop Chromium and Pixel 7 mobile emulation. |
| Production bundle | Normal `npm run build` passed after the isolated browser-test build. Authenticated screens and camera code are lazy-loaded. |
| Credential guard | A dummy administrative key was rejected before bundling and was not printed. |
| Artifact check | Production JS contains no test project URL, fixture teacher name, dummy secret or administrative environment variable. |
| Routing/assets | Local preview direct navigation/refresh and JavaScript/SVG content types passed. This does not certify hosted Vercel rewrites. |
| Visual review | Desktop login and desktop/mobile teacher screens inspected from browser screenshots; no horizontal overflow in tested layouts. |
| Connection checker | Missing configuration returns a clear nonzero result without making requests; no hosted connection is claimed. |
| Diff formatting | `git diff --check` passed. |

## Covered behavior

- Anonymous/teacher/admin/inactive permissions; teacher isolation; blocked direct writes and role elevation.
- Exact entry/exit opening and closing times, expected state/date, working days and holidays.
- Newly configured QR validation; rejection of invalid QR payloads.
- Late justification from 1 to 250 words, including Unicode whitespace and empty input.
- Exact lost-response replay, changed-payload rejection, no extra daily events.
- Retention after Auth unlinking/deletion and policy-history protection.
- Old-session rejection after a trusted password reset; user metadata cannot grant admin access.
- Report totals over 1,053 teacher-day rows, pagination beyond the 1,000-row API cap, and filtered totals.
- Login restoration, role routing, logout cleanup, inactive-session handling and private UI removal.
- Late-entry submission, pending request recovery across reload, and successful reconciliation.
- Admin report filtering and missed-exit notifications.
- Camera permission failure, Escape dismissal, decoding an actual generated QR image from a simulated
  camera stream, one submission, and release of its media tracks.

Browser network responses are deterministic intercepted fixtures, not a hosted Supabase integration.
The simulated camera exercises the actual QR decoder but is not a physical-device test. PGlite serializes
its work; concurrent Promise submissions do not certify multi-session PostgreSQL lock contention.

## Pending before launch

- Install/run Docker and rebuild the full disposable Supabase stack; execute `npm run db:test` (pgTAP).
- Verify true independent-session attendance concurrency and cutoff behavior while waiting for a lock.
- Create/link the new Supabase project, apply migrations, and generate official Supabase types.
- Configure Auth signup restrictions; provision fresh accounts and run live Auth/PostgREST permission checks.
- Generate and print the real school QR with the trusted operator command.
- Create the fresh Vercel project and verify hosted routes/assets/HTTPS and final Auth origins.
- Test actual Android/iPhone camera behavior and the approved workflows over HTTPS.
- Record backup/restore operations and the operational start date; keep test records out of production.
- Record old-service retirement only after the user confirms it. No deletion was performed in this task.

These are launch gates, not completed results. No Supabase project ref or production URL is available yet.

## Setup follow-up — 2026-09-13

The CLI is now linked, and the hosted-generated types include the application tables and RPCs.
The real browser settings were moved from `.env.e2e` into ignored `.env.local`; browser-test
fixtures were restored. The API wrapper now accepts the official generator's no-argument RPC
shape and omits optional arguments when their SQL default is NULL. The locally generated
RPC argument types were aligned so this mismatch does not recur.

Typecheck, lint and all 20 browser regression tests passed. The read-only `check:connection`
reached hosted Supabase Auth successfully using the public key. These checks do not verify
provisioned users, live attendance writes, RLS or the remaining launch gates above.

## Setup steps 1–6 verification — 2026-09-13

This follow-up supersedes the earlier pending entries for Docker, hosted migrations, Auth
configuration and QR generation. Account provisioning is still pending real account-holder details.

- Installed Docker CLI and Colima; started the local stack on PostgreSQL 17.6.1.166, matching
  the hosted project. Rebuilt all three migrations with `supabase db reset --local`.
- Fixed the pgTAP fixture include: the test container only mounts the Supabase tests directory.
  Both pgTAP and the embedded database tests now load `supabase/tests/fixtures.inc`.
  All **15 pgTAP assertions** and **15 unit/embedded database tests** passed.
- Verified **five independent-session concurrency cases** through separate `psql` processes,
  explicitly observing PostgreSQL lock waits. Identical request IDs returned the same event;
  different request IDs yielded one event and `STALE_STATE`. Both cases passed across the
  entry cutoff; a first entry released after the cutoff failed with `ENTRY_CLOSED`.
  A final local reset removed the committed test fixtures and restored `clock_timestamp()`.
- Reinstalled dependencies; npm scripts use Node 24.21.0. Typecheck, lint, all **20 browser tests**,
  and the normal production build passed. The development server returned HTTP 200 on port 5173.
- Confirmed the frontend and CLI target the same new hosted project. All three migrations match;
  the push dry run has no changes. Regenerated hosted types are byte-for-byte identical to
  `src/types/database.ts`. The public-key connection check passed after an initial HTTP 504.
- Configured and read back hosted Auth: public signup disabled, anonymous users disabled,
  email as the only enabled provider, 12-character password minimum, and `http://localhost:5173`
  as Site URL and allowed local redirect. The final HTTPS origin remains a deployment task.
- Corrected local `[auth.email].enable_signup` to keep the email/password provider enabled;
  global `[auth].enable_signup = false` still blocks public signup. Restarted the local stack
  to apply the provider setting.
- Created the operator environment outside the repository with mode 600, in a mode-700 private
  sibling directory. Initial hosted profiles, teachers and attendance tables were empty.
- Generated and activated the real school QR, verified its active checkpoint row, and saved
  the SVG and checkpoint ID in the private directory with mode 600. The private operations
  record contains paths and the checkpoint ID; no QR payload or administrative key is stored here.
- Prepared a private administrator input with a fresh password and blank identity fields.
  **No operational accounts were provisioned**: the verified cédula and full name are still needed.

Vercel setup was left to the user. Step 7's broader live Auth/PostgREST integration checks,
physical-device checks, final HTTPS origin, and launch/backup records remain pending.

## Administrator and teacher management — 2026-09-14

The first administrator and requested test teacher are provisioned and active. Their identities
and credentials are recorded only in the protected private operations directory. Both logins and
the administrator's teacher-report access were verified. No hosted attendance was generated.
This supersedes the pending-account entries above.

The user expanded the release to include teacher account management and notices for both missed
entry and exit windows. `/admin/docentes` now supports creation, search, name/C.I./employment edits,
password resets, access removal/reactivation, and links to filtered attendance history. Passwords
are never returned or retained by the application. Removing access preserves history.

Applied `202609140001_teacher_administration.sql` to local and hosted Supabase; all four migration
versions match. Deployed the `admin-teachers` Edge Function. Its handler validates Auth identity,
current administrator role and JWT session version before privileged work. Account mutations use
private leases, revoke existing sessions, and finish profile/eligibility updates atomically.

Passed:

- Typecheck, lint, **19 unit/embedded database/endpoint tests**, **15 pgTAP assertions**, and
  **24 browser tests**, including desktop and mobile teacher-management workflows and route guards.
- The real local Edge Function/Auth/PostgREST test (`scripts/test-admin-local.mjs`): account creation,
  duplicate/role rejection, teacher denial, C.I./name edits, password resets, old-session rejection,
  disable/reactivate, retained attendance, and revoked administrator denial. Its temporary local
  accounts and attendance were removed.
- Hosted verification with the requested accounts: administrator directory, anonymous/teacher
  mutation denial, same-value test-teacher edit through the deployed function, rejection of the
  prior teacher session, fresh login with the unchanged supplied password, and missed-entry notice.
- Official hosted database types regenerated, followed by the normal production build.

Notifications remain inside the application and refresh every 30 seconds while open. Late
justifications retain the missed-entry notice. Vercel deployment and final HTTPS origin,
physical Android/iPhone camera checks, broader hosted attendance workflow tests, and launch/backup
arrangements remain pending. The requested test teacher should remain separate from operational users.

## Revised attendance windows — 2026-09-15

Applied `202609150001_attendance_windows.sql` to the linked hosted database after confirming
it matches the frontend project and the active policy has no attendance events. Read back the
active policy: entry **06:00:00–06:40:00**, exit **12:40:00–13:30:00**, America/Guayaquil.
The existing policy-history protection remains active. UI schedule labels now read the policy.

Passed: all 19 unit/embedded database/endpoint tests, 12 focused desktop/mobile browser tests
(scanner recovery, late entry immediately after 06:40, exit availability at 12:40), lint,
typecheck through the builds, and the final production build. Embedded database tests cover
both inclusive cutoffs and rejection immediately outside the windows. Local pgTAP was not run:
the disposable Supabase database is stopped (port 54322 refused connections).
