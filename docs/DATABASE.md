# Database and API contract

Apply `supabase/migrations/` in filename order to a **fresh** Supabase project. The initial policy
is effective from its installation date in Ecuador. No operational users/events/checkpoints are seeded.

## Tables and retention

| Table | Ownership and constraints |
| --- | --- |
| `profiles` | Stable UUID; nullable unique Auth UUID; unique 10-digit text cédula; trusted teacher/admin role, activation and session version. Auth deletion sets the link null. |
| `teachers` | Profile PK/FK; inclusive employment dates. Referenced teachers cannot be deleted while attendance exists. |
| `attendance_policies` | Non-overlapping date ranges, Ecuador timezone, weekdays and ordered entry/exit windows. Rules referenced by events cannot be changed or have their dates excluded. |
| `school_holidays` | Explicit nonworking school dates; initially empty. |
| `checkpoints` | Registration location UUID, label and activation. Referenced checkpoints cannot be deleted. |
| `private.checkpoint_tokens` | SHA-256 of a newly generated 256-bit random payload, linked to a checkpoint. Never exposed to browser reads. |
| `attendance_events` | Server timestamp/date, teacher/policy/checkpoint, entry/late-entry/exit, sequence, request UUID/hash and optional justification. Unique teacher/request and teacher/day/sequence. Sequence 1 is entry, 2 is exit. |

Use activation to suspend access; use employment end dates to stop future report eligibility.
Account unlinking/deletion never cascades into operational history. Take backups before any trusted
maintenance. Do not manually change historical employment dates or holidays to hide existing records.

## Authorization

RLS is enabled on every table, including the private token table. Anonymous browser table access
and attendance writes are denied. Teachers can select only their own profile, teacher and event rows;
admins can read all three. Both require activation and a matching trusted session-version claim.
Administrators also require the signed JWT's top-level `aal` claim to be `aal2` for all three tables,
including their own profile. Missing/invalid assurance claims deny access. Role selection never reads
user-editable metadata.

The only browser attendance write path is `record_attendance`. Security-definer functions have an
empty search path, qualified objects and explicit caller checks; PUBLIC execution is revoked.
Private helpers cannot be called by browser roles, except the boolean RLS ownership predicate.
Trusted provisioning functions are executable only by `service_role`/database administration.

## Browser RPCs

All browser functions require authenticated access. The frontend's generated database types describe
Postgres columns and RPC arguments; `src/types/app.ts` describes the JSON response shapes.
Every browser RPC calls `private.caller()`, which rejects administrators without `aal2` with
`MFA_REQUIRED` after validating the active profile and session version. This includes `app_context`:
no administrator workspace data is returned before MFA. The UI uses that error to offer TOTP enrollment
or verification through Supabase Auth. Teachers do not require MFA.
The `admin-teachers` Edge Function checks this RPC and independently requires `aal2` in the same
bearer token already validated by Supabase Auth before making any service-role call.

### `app_context()` → JSON

`{ profile, server_time, school_date, policy, working_day, events }` for the caller. Used for session
role routing, eligibility and the displayed clock; it does not authorize a later write.

### `record_attendance(...)` → event JSON

Arguments: `p_kind` (`entry`, `late_entry`, `exit`), `p_school_date` (expected date),
`p_prior_sequence`, `p_request_id` (UUID), optional `p_qr`, optional `p_justification`.

1. Resolve active teacher from Auth and trusted session version.
2. Lock the profile row, then recheck activation, Auth link and session version.
3. Return the original event for an identical previously committed request; reject a changed payload.
4. Read server time **after** locking. Reject stale dates/state, ineligible days or employment.
5. Enforce the applicable windows, token/activation and justification rules.
6. Insert an immutable event with the next daily sequence and server-controlled ownership/time.

No timestamp, teacher ID or policy override is accepted. Late entry has no QR/checkpoint and requires
1–250 words. QR entry/exit requires an active checkpoint and no justification. Text is capped at
10,000 characters as well as 250 words; Unicode whitespace counting matches the browser.

Expected errors: `ACCESS_DENIED`, `INVALID_REQUEST`, `STALE_DATE`, `STALE_STATE`, `ENTRY_CLOSED`,
`EXIT_CLOSED`, `INVALID_QR`, `JUSTIFICATION_REQUIRED`, `JUSTIFICATION_NOT_OPEN`, `NOT_WORKING_DAY`,
`SCHOOL_NOT_CONFIGURED`, `REQUEST_REUSED`.

The browser retains the exact request and UUID in per-session storage for an uncertain outcome.
Reconciliation is deliberate, using the same arguments. Logout/account changes clear it. Offline
attendance is not queued. RPC requests time out after 15 seconds and private fetches use no-store.

### `attendance_report(p_from, p_to, p_page=0, p_search='')` → JSON

`{ as_of, page, page_size:25, totals, rows }`. Range maximum is 31 inclusive days, search maximum
120 characters, page is zero-based. A teacher is always restricted to their own ID, regardless of
search arguments. Admin search matches literal substrings of name or cédula. There is no client
teacher-ID override. Invalid inputs raise `INVALID_FILTER`.

Each request captures one report timestamp, applies eligibility and filters, then computes all totals
before paging. Totals: `expected`, `on_time`, `late`, `entry_on_time`, `entry_late`,
`exit_on_time`, `exit_late`, `missing_entry`, `absent`, `missing_exit`, `completed`.

The Entradas and Salidas card rows use their own `entry_on_time` / `entry_late` and
`exit_on_time` / `exit_late` counters. FALTAS is a separate daily absence total. Apply
`202609170002_separate_entry_exit_statistics.sql` before deploying these separate rows.

Combined `on_time` and `late` counters remain available for compatibility; each equals the
sum of its entry and exit counters. Timeliness uses the window for the corresponding mark:

- `on_time`: each mark recorded inside its respective entry or exit window, including both endpoints.
- `late`: each mark recorded after its respective window closes; unmarked `late_pending` days do not count.

An on-time entry plus an on-time exit contributes two to `on_time`. A late entry plus an
on-time exit contributes one to each total. Late exit records, if present, count toward `late`;
the marking flow still rejects exits outside the exit window. These counts use recorded
timestamps and the policy for that date and can exceed the number of daily history rows.

The remaining statistics count teacher-days:
- `missing_entry`: an exit exists without an entry (`Sin entrada`).
- `missing_exit`: an entry exists without an exit after the exit window closes.
- `absent`: neither mark exists after the exit window closes (`FALTAS` / `Sin asistencia`).

At the exact exit cutoff, unmarked days remain pending. Weekends, holidays, future dates and
days outside employment remain excluded. Timeliness and missing-mark counts can overlap.
The current marking RPC still requires an entry before an exit; reports can distinguish
exit-only records if supplied through trusted maintenance. Apply
`202609170001_attendance_statistics.sql` before deploying the updated frontend.

Rows include teacher/name/cédula/date, entry/exit timestamps, statuses, justification and worked minutes.
The timestamp makes each request internally consistent; pages requested at different times can reflect
new attendance. Export and a multi-request snapshot mechanism are outside this release.

### `admin_notifications(p_page=0)` → JSON

`{ total, rows }` with 25 notices per page, newest day then teacher UUID and `kind` (`entry`/`exit`).
Rows include the teacher's name, C.I., school date and nullable entry timestamp. Derives missing/late
entries after the entry cutoff and unmatched entries after the exit cutoff, even when nobody was
online at closing. Late justifications retain their missed-entry notice.
No cron task is needed. Notices remain available as part of attendance history; dismissal is not included.

### `admin_teachers(p_page=0, p_search='')` → JSON

Administrator-only directory with 25 rows per page and a total over all matching teachers.
Each row includes stable ID, name, C.I., access state and employment dates. It returns no passwords.
The `admin-teachers` Edge Function accepts `create`, `update`, `reset-password`, and `disable` actions,
authenticates the caller through Auth and `app_context()`, and limits mutations to teacher profiles.
Account deletion means access removal, with retained attendance. Name/C.I. edits also update the Auth
login alias; password resets and edits revoke existing application sessions.

## Trusted RPCs

- `activate_profile(p_profile_id, p_auth_user_id, p_employed_from)` verifies the Auth identity mapping,
  creates teacher eligibility if applicable and activates the profile atomically. Rejects an already
  active/missing profile or mismatched Auth account. Existing teacher history is preserved on recovery.
- `configure_checkpoint(p_id, p_label, p_payload)` atomically creates/rotates a checkpoint and private
  SHA-256 token. Called only by the operator CLI; a replacement token immediately invalidates the old QR.
- `lock_teacher_admin` / `unlock_teacher_admin` hold private per-account leases while the Edge
  Function changes Auth and the profile. Only `service_role` may invoke them. Leases expire after
  five minutes; outbound Edge Function requests have a one-minute deadline.
- `finish_teacher_admin` checks the lease and pending session version, confirms the Auth alias,
  and atomically finalizes profile/eligibility changes. Employment dates cannot exclude recorded events.
  Interrupted operations keep application access disabled until reconciled.

## Testing and types

`npm test` rebuilds all migrations in isolated PGlite PostgreSQL with a minimal Auth-role fixture,
then exercises RLS, functions, time boundaries, Unicode justification limits, replay, retention,
session revocation and totals beyond 1,000 rows. The test-only private clock replacement is confined
to the disposable harness. Production `private.server_now()` always calls `clock_timestamp()`.

`npm run db:types` rebuilds the schema and generates table/RPC TypeScript types from its catalog.
Relationship metadata is not generated because the client uses RPCs. After actual Supabase setup,
replace this with official output using `npx supabase gen types typescript --linked --schema public`.

`npm run db:test` runs the separate pgTAP suite on a Docker-backed local Supabase stack.
`scripts/test-admin-local.mjs` verifies the real local Edge Function/Auth/PostgREST account lifecycle.
PGlite serializes connection work; independent-session checks are recorded separately in
`VERIFICATION.md`, together with the latest local and hosted evidence.
