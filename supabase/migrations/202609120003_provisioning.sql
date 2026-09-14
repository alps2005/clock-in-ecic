-- Trusted administration only: final activation and teacher eligibility are atomic.
create function public.activate_profile(p_profile_id uuid, p_auth_user_id uuid, p_employed_from date default null)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id=p_profile_id for update;
  if p.id is null or p.active then raise exception 'PROFILE_NOT_PENDING'; end if;
  if not exists(select 1 from auth.users where id=p_auth_user_id and email=p.cedula||'@login.clock-in.invalid') then raise exception 'IDENTITY_MISMATCH'; end if;
  if p.role='teacher' then
    if p_employed_from is null then raise exception 'EMPLOYMENT_REQUIRED'; end if;
    insert into public.teachers(id,employed_from) values(p.id,p_employed_from) on conflict(id) do nothing;
  end if;
  update public.profiles set auth_user_id=p_auth_user_id,active=true where id=p.id;
end;
$$;
revoke all on function public.activate_profile(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.activate_profile(uuid,uuid,date) to service_role;
