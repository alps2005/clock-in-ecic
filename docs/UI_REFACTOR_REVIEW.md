# Teacher workspace refactor

Teachers now have an inset desktop workspace, fixed mobile navigation, a state-driven jornada dashboard, and history with grouped totals, Spanish date controls, accessible justifications, and responsive records. Teacher sessions no longer request administrator sidebar counts.

## Stack and references

React 19.2, TypeScript 6, Vite 8, Tailwind CSS 4.3, React Router 8.3, Lucide, and Supabase JS 2.116. There is no shadcn installation, components.json, React Query, or SWR. Data fetching uses the existing `useRemote` hook. Most styling uses custom CSS.

The implementation uses scoped CSS tokens, existing buttons/icons, native modal dialogs and popovers, and a keyboard-accessible calendar without adding application dependencies. Geist loads through Google Fonts with local system fallbacks. The admin interface retains its existing styles. Reference: [local prototype](ecic-clock-in-redesign.html), supplied during implementation. Its preview selectors and fixture records are excluded from production. Documentation is excluded from Tailwind source scanning.

## Supabase error: explanation and evidence

`Workspace` previously called `useRemote(getAdminSidebarCounts, 30_000)` unconditionally, before `app_context` established the user's role. This caused teacher sessions to call `admin_sidebar_counts()` on load, at polling intervals, and on tab visibility changes.

The repository migration defines an argument-free, `SECURITY DEFINER` function returning JSONB. It deliberately raises `ACCESS_DENIED` when `private.caller()` returns a non-admin profile. The client signature matches the SQL definition.

Executing the function as an authenticated teacher against the repository migrations in isolated PostgreSQL reproduced:

```json
{"message":"ACCESS_DENIED","code":"P0001","hint":null,"details":null}
```

This is local SQL evidence, not a captured production HTTP response. An authenticated live browser session was unavailable. Production deployment and a live Network-panel check remain outside this local verification.

The caller now waits for a loaded, error-free profile with an `auth_user_id` matching the session and `role === 'admin'`. On an admin count failure, counts disappear, one warning is logged, and polling/visibility retries stop for that fetch lifecycle. No migrations, RPC signatures, RLS, role checks, or report queries were changed.

Browser regression checks verify zero teacher count requests, admin count values, role resolution before fetching, and graceful failure without retries.

## Preserved behavior and choices

- QR registration, exact scanner windows, late-entry justification, request replay, the 250-word limit, report totals, and pagination are retained.
- The server-backed institution clock uses `America/Guayaquil`, even when the browser uses `Asia/Tokyo`.
- The user approved changing personal history's default from today to Monday–Friday and preserving additional existing statuses.
- Presets use the server's school date. The month preset spans the calendar month; report queries retain the existing maximum of 31 days.
- The calendar always displays `DD/MM/YYYY` and submits ISO dates, independently of browser locale. It supports arrow keys, Home/End, Escape, and focus restoration.
- Export retains the existing current-week CSV/Excel preview and all-page collection. It does not change to exporting the displayed date filter.
- The prototype's dimmed inactive schedule rows use a subdued surface and dashed timeline windows instead of lowering text opacity, to preserve contrast.
- Existing scanning and pending-request actions remain available as a card between the KPIs and schedule.
- Theme follows the operating system; no existing app theme toggle was present.
- All teacher destinations remain `/jornada` and `/historial`; administrator routes retain their existing behavior.

## Status colors

| Status | Tone |
| --- | --- |
| A tiempo, En jornada, Registrada, Jornada completa | Success |
| Atraso justificado, Atraso sin justificación, Entrada pendiente, Jornada incompleta, closed-window notices | Warning |
| Sin asistencia, Sin entrada in history | Danger |
| Pendiente, Próxima, Sin jornada, Sin horario, Actualizando | Neutral |
| Ventana abierta, Abierta | Accent |

Missing exit remains explicitly labeled in history. Summary counts come directly from the same `entry_on_time`, `entry_late`, `missing_entry`, `exit_on_time`, `exit_late`, `missing_exit`, and `absent` totals used before.

## Validation

- Production build, TypeScript check, lint, and whitespace checks pass.
- 47 unit/database tests pass, including all jornada state rows, exact boundaries, date rollover, late entry, missing exit, timeline limits, and date presets.
- 61 browser tests pass. One duplicate viewport-matrix run is intentionally skipped on the mobile project because the desktop test explicitly exercises all mobile and desktop widths.
- Viewports: 375, 402, 768, 1024, and 1440 px, both themes, both pages, no horizontal document or content overflow.
- Browser coverage includes scanner recovery and track cleanup, export downloads, error/retry/empty/loading states, pagination, date validation, account popover, sidebar persistence, route scroll reset, and dialog focus trapping/restoration.
- No application runtime errors or unexpected REST failures in the page matrix.
- Lighthouse 13.5 accessibility snapshot audits at 402 × 874: **100/100** for both pages in light and dark. These are authenticated fixture-based local audits, not production performance scores. [Machine-readable results](review/accessibility.json).
- Audit issues fixed: inactive range-button contrast, mobile definition-list markup, and dialog Tab wrapping.

Reproduce browser checks with `npm run test:e2e`. For Lighthouse, install `lighthouse` and `puppeteer-core` into a temporary directory, set `ECIC_AUDIT_TOOLS_DIR` to that directory, build with `npm run build:e2e`, serve with `npm run preview -- --host 127.0.0.1 --port 4174`, then run `node scripts/audit-teacher-ui.mjs`. The audit uses test-only mocked authentication and backend responses. Rebuild production afterward with `npm run build`.

## Screenshots

| Page | 402px light | 402px dark | 1440px light | 1440px dark |
| --- | --- | --- | --- | --- |
| Mi jornada | [View](review/jornada-402-light.png) | [View](review/jornada-402-dark.png) | [View](review/jornada-1440-light.png) | [View](review/jornada-1440-dark.png) |
| Mi historial | [View](review/historial-402-light.png) | [View](review/historial-402-dark.png) | [View](review/historial-1440-light.png) | [View](review/historial-1440-dark.png) |

Mobile screenshots capture the initial viewport; the main content scrolls while the top and bottom bars remain fixed.

Lighthouse reports: [Jornada light](review/lighthouse-jornada-light.html), [Jornada dark](review/lighthouse-jornada-dark.html), [History light](review/lighthouse-historial-light.html), [History dark](review/lighthouse-historial-dark.html).
