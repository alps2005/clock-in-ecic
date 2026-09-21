-- Require a verified second factor for every administrator, including first enrollment.
-- All browser-facing RPCs call private.caller(); no admin data is returned at aal1.
create or replace function private.caller() returns public.profiles
language plpgsql stable security definer set search_path = '' as $$
declare v public.profiles;
begin
  select * into v from public.profiles where auth_user_id = (select auth.uid()) and active
    and session_version::text = (select auth.jwt()->'app_metadata'->>'ecic_session_version');
  if v.id is null then raise exception 'ACCESS_DENIED'; end if;
  if v.role = 'admin' and (select auth.jwt()->>'aal') is distinct from 'aal2' then
    raise exception 'MFA_REQUIRED';
  end if;
  return v;
end;
$$;

-- Direct REST/table reads must enforce the same requirement, even for the admin's own row.
create or replace function private.can_read(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.auth_user_id = (select auth.uid())
    and p.active and p.session_version::text = (select auth.jwt()->'app_metadata'->>'ecic_session_version')
    and (p.role <> 'admin' or (select auth.jwt()->>'aal') = 'aal2')
    and (p.id = p_id or p.role = 'admin'));
$$;

revoke all on function private.caller() from public, anon, authenticated;
revoke all on function private.can_read(uuid) from public, anon;
grant execute on function private.can_read(uuid) to authenticated;
