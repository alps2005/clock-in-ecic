# Clock-in ECIC — first-release product brief

Confirmed with the user on 2026-09-12. This is a new app, with no imported legacy code,
accounts, attendance, QR payloads or database objects.

## Scope and permissions

- Spanish responsive interface; school timezone `America/Guayaquil`.
- Teachers sign in with an Ecuadorian 10-digit cédula and password.
- Scope extended on 2026-09-14: administrators manage teachers at `/admin/docentes` — create,
  search, edit names/C.I./employment dates, reset passwords, disable and reactivate access.
  The first administrator is provisioned through the trusted operator command.
  Passwords may be set/reset but existing passwords are never retrievable or stored as plaintext.
  Removing access preserves the teacher profile and attendance history.
- Teachers record their own attendance and view personal history. Administrators review
  daily/date-range reports and missed entry/exit window notifications; admin accounts do not record attendance.
- Monday–Friday, one entry/exit pair per teacher per school day. No overnight shifts.
- No Excel export, manual corrections, installation/PWA, email notifications, payroll or multiple schools.

## Attendance rules

| School time | Behavior |
| --- | --- |
| Before 06:00 | Entry scanner blocked |
| 06:00:00 through 06:40:00 inclusive | School QR records an on-time entry |
| After 06:40:00, without an entry | Entry scanner blocked; teacher is flagged late and prompted for a text justification |
| Late justification | 1–250 whitespace-separated words; submission immediately records a late arrival, without admin approval or a QR scan |
| Before 12:40 | Exit scanner blocked |
| 12:40:00 through 13:30:00 inclusive | School QR records the exit; an entry is required |
| After 13:30:00, with entry but no exit | Scanner blocked; “Salida no registrada”; notification visible to administrators |

Implementation interpretations recorded explicitly:

- Cutoffs are exact instants, not the end of the displayed minute. The server rechecks the
  window after taking the teacher lock; opening the camera before cutoff does not reserve a slot.
- The user specified no separate justification deadline: late justifications remain available
  until midnight of the same school day. A justification after 13:30 records a late entry with
  a missed exit; it cannot backdate attendance. No edits/corrections are available in this release.
- The first release uses a newly generated **static school QR**, with a private hashed token and
  trusted rotation command. A static QR is copyable; it is not proof of physical presence.
- No holidays were supplied. The holiday table starts empty; a trusted operator can configure
  actual nonworking dates before their use. No holiday calendar is inferred.
- A missing-exit notification requires a recorded entry. A teacher with neither event is
  reported as “Sin entrada” after closing and produces a missed-entry notice, without a duplicate
  missed-exit notice. Late justifications retain the missed-entry notice because the window was missed.
- Admin notifications are a persistent derived list and navigation badge, refreshed every
  30 seconds while open and on returning to the tab. No email or push message is sent.

## Identity and recovery

Cédulas stay text, including leading zeros. Validation enforces exactly 10 ASCII digits;
the provisioning administrator verifies the actual identity document. This is not a civil-registry
or checksum verification service.

The newly selected Supabase Auth mapping is `<cedula>@login.clock-in.invalid`. This internal
address is not a mailbox or a recovery email; it is not shown as a login field. Only the protected
administrator server function or trusted operator provisioning creates Auth users and links them
to stable profile UUIDs. Supabase public signup
and anonymous login must be disabled. New users need trusted `app_metadata.ecic_session_version`.

Password resets increment the trusted profile/session version, invalidating previous application
access tokens immediately. User-editable metadata cannot grant permissions. A disabled or unlinked
login cannot access the app; historical teacher records remain available to administrators.

## Reports

Each eligible teacher/day contributes one row, based on employment dates, policy weekdays and
configured holidays. Historical eligibility does not depend on the account's current active flag.

- “A tiempo”: recorded QR entry in the entry window.
- “Atraso justificado”: recorded late entry and justification.
- “Atraso · sin justificación”: entry missing after 06:40 and before the exit deadline.
- “Sin entrada”: no entry after 13:30. If a same-day late justification is later submitted,
  the current report changes to a recorded late arrival.
- “Salida no registrada”: entry exists and no exit after 13:30.
- Worked time: whole minutes between matched entry and exit; null for incomplete pairs.

Reports accept up to 31 inclusive dates, a teacher name/cédula substring filter for admins, and
25 rows per page. Totals cover the entire filtered dataset before pagination. Pages sort by date
(descending), full name, then stable teacher UUID. “Atrasos” includes pending justifications.

## Infrastructure status

The new Supabase project is linked with the school QR and initial administrator/test teacher.
The app, migrations, operator tooling and administrator screen are implemented. See the latest
verification record for deployment and test evidence. Vercel deployment, final HTTPS origin,
and physical-device camera verification remain launch steps.
Old-service retirement is user-owned and its current status has not been confirmed.
