# ECIC: retire the old services and set up a fresh environment

Prepared: 2026-09-11. Companion: [BUILD_PLAN.md](BUILD_PLAN.md).

The user will delete the current Supabase project and take down the current Vercel deployment. The new `clock-in-ecic` application will be built from scratch with its own product brief, a new Supabase project and a fresh Vercel project. No application code, database objects, accounts or attendance are being migrated.

This document records future steps. No cloud service was changed while preparing it. Old-service shutdown is user-owned; an implementation agent should not duplicate that action or infer authorization to delete additional resources.

## 1. User: identify the old resources and retain anything needed

Record these values privately before deletion:

| Item | Value |
| --- | --- |
| Old Supabase organization, project name and ref | Verify in Supabase |
| Old Vercel team, project name and production URL | Verify in Vercel |
| Custom domain and DNS configuration | Record if the domain will be used again |
| Other consumers of the old backend | Identify any Flutter builds, scripts or other apps |
| Data disposition | Archive selected records or intentionally discard them |

The old app's README says its backend is shared with an older Flutter app. The referenced configuration directory is absent from this workspace, and no local Vercel project link was found during inspection. Confirm the actual dashboard project identities and whether another client still needs that backend.

If retaining records, export them to a protected location outside the repositories before deletion. For recovery of a database, use and verify a database backup rather than relying on a report spreadsheet. Download needed Storage files separately; database backups contain their metadata, not their contents. Any archive stays separate from the new application's database. [Supabase backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [backup coverage](https://supabase.com/docs/guides/platform/backups).

Old-service shutdown can happen before the new app is ready. It does not depend on completing the build plan; attendance service will be unavailable until the new launch. Preserve the local repositories and their uncommitted work independently of cloud retirement.

## 2. User: take down the old Vercel service

1. Select the correct team and old application project in Vercel. Verify its production URL and repository.
2. To retire the entire project permanently, open **Settings → General → Delete Project** and complete its confirmation. Deleting a project removes its deployments, project domain assignments, environment variables and settings. [Vercel project deletion](https://vercel.com/docs/projects/managing-projects#deleting-a-project).
3. If “take down” means keeping the project for later inspection, use **Settings → General → Pause Project** instead. Check any old preview/deployment URLs separately; do not assume a production pause removes every other reachable deployment. [Vercel project pause](https://vercel.com/docs/projects/managing-projects#pause-a-project-from-the-dashboard).
4. Verify the old production URL no longer serves the attendance app. If keeping the Git connection, ensure future pushes cannot unintentionally put the retired app back into service.
5. Record whether the project was deleted or paused. A fresh Vercel project will be created for the new app either way.

Keep any desired domain registration and unrelated DNS/mail records. Removing a deployment is not an instruction to cancel the domain or delete the Git repository.

## 3. User: delete the old Supabase project

1. Select the recorded old organization and project ref.
2. Confirm no remaining application needs it and that any desired archive has been saved outside the project.
3. Open **Settings → General → Delete project**, enter the requested project name and complete deletion.
4. Verify the old project is gone. Deletion permanently removes the database, Auth users/sessions, Storage, functions and hosted backups. [Supabase deletion instructions](https://supabase.com/docs/guides/platform/delete-project).

Do not manually drop managed `auth`/`storage` schemas or use a remote database reset as a substitute for project deletion. Once deleted, the old project cannot be recovered through undo; any recovery depends on a separately retained archive. The new app will use fresh accounts and empty attendance regardless of whether an archive exists.

After user confirmation that steps 2–3 are complete, the implementation agent should record that status and proceed with the new environment. It should not attempt the deletions again.

## 4. Build the new application and define its schema

Follow [BUILD_PLAN.md](BUILD_PLAN.md). Establish the new product brief before choosing identity, attendance method, schedule, permissions and reports. Old login conventions, QR contents, hours, UI and routes are not requirements for the new build.

The current Vite project is a starter. Its implementation agent must create the new schema, RLS/RPCs, provisioning workflow, tests and application before they can be deployed. SQL migration files in this process are versioned schema definitions for a new database, not a transfer from the old project.

Required deliverables before schema deployment:

- `docs/PRODUCT_BRIEF.md` and the finalized schema/API documentation.
- `supabase/config.toml`, ordered new SQL migrations and database tests.
- Nonpersonal configuration seeds based on the new brief.
- A trusted account-provisioning workflow and read-only connection check.
- A project-local Supabase CLI dependency and lockfile.
- Generated-type output directory and placeholder `.env.example`.

The new cloud project may be created while implementation is in progress. Leave its operational data empty until the schema and provisioning workflow are ready.

## 5. Create the new Supabase project

1. Choose **New project** in the intended organization. Use a distinct name such as `clock-in-ecic-prod`, select the region/plan and store a new database password privately. Wait for the project to become healthy. [Supabase project setup](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs).
2. Record the new project ref and URL. They are new identifiers, even if a previous display name is reused.
3. Obtain the project URL and publishable key from Connect/API settings. Obtain an administrative secret separately only if required by trusted provisioning.
4. Keep credentials separated:

| Credential | Use |
| --- | --- |
| Project URL and publishable key | Browser public configuration |
| Secret/service-role key | Trusted provisioning environment only |
| Database password | Password manager and CLI prompts |
| Management access token | CLI login or approved CI secrets only |

Do not restore an old backup or run the old app's migration directory into this project.

## 6. Apply and verify the new schema

Use the implementation's locked CLI version. Docker is required for the disposable local Supabase stack. [CLI setup](https://supabase.com/docs/guides/local-development/cli/getting-started).

From the workspace root:

```sh
cd clock-in-ecic
npm ci
```

If the required schema/configuration files are absent, continue build-plan Phase B before the database commands below. First rehearse against the disposable local stack:

```sh
npx supabase start
npx supabase db reset --local
npx supabase test db
```

The reset destroys local development data. Keep `--local`; do not change it to `--linked`.

Link explicitly to the newly created project, replacing the placeholder and providing passwords through prompts:

```sh
npx supabase login
npx supabase link --project-ref NEW_PROJECT_REF
npx supabase migration list
npx supabase db push --dry-run
```

Verify the linked ref and pending files, then apply the new schema:

```sh
npx supabase db push
npx supabase migration list
npx supabase gen types typescript --linked --schema public > src/types/database.ts
```

If school configuration lives in `seed.sql`, review it for approved nonpersonal defaults and use the documented `db push --include-seed` workflow. Do not seed the same defaults twice or include test accounts/attendance. [Database migration workflow](https://supabase.com/docs/guides/deployment/database-migrations), [CLI reference](https://supabase.com/docs/reference/cli/supabase-db-push).

Verify tables, constraints, RLS, grants and RPCs in the new project. Address relevant security diagnostics. Keep deterministic business-rule and concurrency fixtures in the local test environment; use only dedicated disposable accounts for hosted smoke checks.

## 7. Configure Auth and connect the new app

1. Configure authentication to match the new product brief. For an administrator-provisioned app, disable public signup and anonymous sign-ins. Enable only the selected login method. [Supabase Auth configuration](https://supabase.com/docs/guides/auth/general-configuration).
2. Set **Authentication → URL Configuration → Site URL** to the final HTTPS origin when known. Allow the exact local/test redirect URLs required by the implementation, such as `http://localhost:5173`. [Redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).
3. Use the new trusted provisioning workflow to create the first administrator and fresh teacher accounts. Follow the new identity and recovery contract; do not assume the old cédula-to-email mapping. Verify roles and related profile records before activation.
4. Create separate test users as needed. Do not reuse old credentials or leave fixture attendance in operational records.
5. Create the ignored `.env.local` from the new `.env.example`:

```dotenv
VITE_SUPABASE_URL=https://NEW_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=NEW_PUBLIC_PUBLISHABLE_KEY
```

These values are public browser configuration. Keep administrative secrets elsewhere. Restart development or rebuild after changing Vite variables. [Vite environment handling](https://vite.dev/guide/env-and-mode).

After implementation adds the scripts, run:

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

Run the documented connection check and Playwright suite against the production preview. Verify the selected login and role rules. Test schedule boundaries locally without weakening production rules or exposing a client-controlled clock override.

## 8. Create the fresh Vercel project

1. Push the completed new implementation to its intended Git repository. In Vercel select the intended team, choose **Add New → Project** and import it. [Vercel project creation](https://vercel.com/docs/projects/managing-projects#creating-a-project).
2. Configure:

| Setting | Value |
| --- | --- |
| Project name | A new project, e.g. `clock-in-ecic` |
| Framework | Vite |
| Root directory | `.` for the independent app repository; `clock-in-ecic` only if that folder exists within the imported repository |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | The version tested and documented by the implementation |

3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for Production. Configure Preview separately, preferably with a test backend when previews will write data.
4. Include the SPA fallback in the new project's `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Verify chosen application routes through direct navigation and refresh, as well as correct static-asset content types. [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite#using-vite-to-make-spas).

5. Deploy and record the actual HTTPS URL. Update the new Supabase Auth Site URL and allowed redirects. Rebuild if frontend configuration changes.
6. If reusing a custom domain, assign it to the new project and follow the host's DNS instructions while preserving unrelated records. If an old service worker used that origin, explicitly retire/update it and its app-owned caches so it cannot serve the old application. This cleanup applies even if the new app is not a PWA.

## 9. Validate and launch

- Verify the workflows, permissions, schedule and reports defined in the new product brief.
- Inspect network requests: the app must use the new Supabase project only, and built assets must contain no administrative secrets.
- If QR capture is selected, generate and print a new QR matching the new checkpoint configuration; verify physical-device camera behavior over HTTPS.
- If export or PWA support is included, complete their specific acceptance tests.
- Verify fresh account login, logout and isolation. Remove only dedicated fixture data before operational use.
- Record the new operational start time, project ref, deployment URL, Git commit, schema versions and verification results. New attendance starts here; old history remains outside this product.
- Prepare the new URL and login/install instructions for users. Existing home-screen shortcuts do not automatically move to a different origin.

Completion checklist:

- [ ] User has deleted the old Supabase project and taken down the old Vercel service; actual status is recorded.
- [ ] Remaining old backend dependencies are resolved.
- [ ] The new app implements its own agreed product brief.
- [ ] New Supabase schema, permissions and fresh accounts are verified.
- [ ] A fresh Vercel project serves the new app over HTTPS.
- [ ] Required local, browser and physical-device checks are recorded.
- [ ] No old data import, reused credentials or operational test fixtures remain.
- [ ] README documents the new setup, account lifecycle and deployment.

If the new launch fails, fix the new environment and redeploy. The deleted old Supabase project is not a rollback target; any retained archive is a separate recovery asset. Remove obsolete project-specific credentials, hooks and domain assignments after checking that other applications do not depend on them.
