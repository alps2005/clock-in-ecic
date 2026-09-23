import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'

export async function database() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid; $$;
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{"app_metadata":{"ecic_session_version":1}}')::jsonb; $$;
    grant execute on function auth.jwt() to authenticated;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `)
  for (const name of (await readdir('supabase/migrations')).filter(x => x.endsWith('.sql')).sort()) {
    // PGlite has no pg_cron worker. Test retention by invoking the same SQL helper;
    // the scheduling-only migration is exercised on real Supabase/Postgres.
    if (name === '202609230002_notification_cleanup_schedule.sql') continue
    await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'))
  }
  return db
}
