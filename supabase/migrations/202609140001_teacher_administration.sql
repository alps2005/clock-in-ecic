-- Private leases serialize multi-request Auth/profile administration.
create table private.teacher_admin_locks (
  key text primary key,
  token uuid not null default gen_random_uuid(),
  expires_at timestamptz not null default clock_timestamp() + interval '5 minutes'
);
alter table private.teacher_admin_locks enable row level security;
revoke all on private.teacher_admin_locks from public,anon,authenticated;

create function public.lock_teacher_admin(p_key text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if p_key is null or length(p_key)>100 then raise exception 'INVALID_REQUEST'; end if;
  delete from private.teacher_admin_locks where key=p_key and expires_at<clock_timestamp();
  insert into private.teacher_admin_locks(key) values(p_key) on conflict do nothing returning token into result;
  if result is null then raise exception 'ACCOUNT_BUSY'; end if;
  return result;
end;
$$;
create function public.unlock_teacher_admin(p_key text,p_token uuid) returns void
language sql security definer set search_path='' as $$
  delete from private.teacher_admin_locks where key=p_key and token=p_token;
$$;
revoke all on function public.lock_teacher_admin(text),public.unlock_teacher_admin(text,uuid) from public,anon,authenticated;
grant execute on function public.lock_teacher_admin(text),public.unlock_teacher_admin(text,uuid) to service_role;

create function public.admin_teachers(p_page integer default 0,p_search text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller public.profiles; result jsonb;
begin
  caller:=private.caller();
  if caller.role<>'admin' then raise exception 'ACCESS_DENIED'; end if;
  if p_page is null or p_page<0 or p_page>100000 or p_search is null or length(p_search)>120 then raise exception 'INVALID_FILTER'; end if;
  with teachers as materialized (
    select p.id,p.full_name,p.cedula,p.active,t.employed_from,t.employed_until
    from public.profiles p left join public.teachers t on t.id=p.id
    where p.role='teacher' and (btrim(p_search)='' or position(lower(btrim(p_search)) in lower(p.full_name))>0 or position(btrim(p_search) in p.cedula)>0)
  ), page as (select * from teachers order by full_name,id limit 25 offset p_page*25)
  select jsonb_build_object('total',(select count(*) from teachers),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by full_name,id) from page),'[]')) into result;
  return result;
end;
$$;
revoke all on function public.admin_teachers(integer,text) from public,anon;
grant execute on function public.admin_teachers(integer,text) to authenticated;

-- Complete an Auth change atomically, only while the matching operation still owns the lease.
create function public.finish_teacher_admin(p_key text,p_token uuid,p_id uuid,p_version integer,
  p_auth_id uuid,p_full_name text,p_cedula text,p_from date,p_until date,p_active boolean) returns void
language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
  perform 1 from private.teacher_admin_locks where key=p_key and token=p_token and expires_at>clock_timestamp() for update;
  if not found then raise exception 'ACCOUNT_BUSY'; end if;
  select * into p from public.profiles where id=p_id for update;
  if p.role is distinct from 'teacher' or p.active or p.session_version<>p_version then raise exception 'ACCOUNT_CHANGED'; end if;
  if not exists(select 1 from auth.users where id=p_auth_id and email=p_cedula||'@login.clock-in.invalid') then raise exception 'IDENTITY_MISMATCH'; end if;
  if p_from is null or (p_until is not null and p_until<p_from) then raise exception 'EMPLOYMENT_REQUIRED'; end if;
  if exists(select 1 from public.attendance_events where teacher_id=p_id and (school_date<p_from or school_date>p_until)) then raise exception 'EMPLOYMENT_HAS_HISTORY'; end if;
  insert into public.teachers(id,employed_from,employed_until) values(p_id,p_from,p_until)
    on conflict(id) do update set employed_from=excluded.employed_from,employed_until=excluded.employed_until;
  update public.profiles set auth_user_id=p_auth_id,full_name=btrim(p_full_name),cedula=p_cedula,active=p_active where id=p_id;
end;
$$;
revoke all on function public.finish_teacher_admin(text,uuid,uuid,integer,uuid,text,text,date,date,boolean) from public,anon,authenticated;
grant execute on function public.finish_teacher_admin(text,uuid,uuid,integer,uuid,text,text,date,date,boolean) to service_role;

create or replace function public.admin_notifications(p_page integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller public.profiles; t timestamptz; first_day date; result jsonb;
begin
  caller:=private.caller(); if caller.role<>'admin' then raise exception 'ACCESS_DENIED'; end if;
  if p_page is null or p_page<0 or p_page>100000 then raise exception 'INVALID_FILTER'; end if;
  t:=private.server_now();
  select min(employed_from) into first_day from public.teachers;
  with days as materialized (
    select * from private.daily_rows(first_day,(t at time zone 'America/Guayaquil')::date,null,'',t)
  ), missing as materialized (
    select teacher_id,full_name,cedula,school_date,entry_at,'entry'::text as kind from days where entry_status in ('late','late_pending','absent')
    union all
    select teacher_id,full_name,cedula,school_date,entry_at,'exit'::text as kind from days where exit_status='missing'
  ), page as (select * from missing order by school_date desc,teacher_id,kind limit 25 offset p_page*25)
  select jsonb_build_object('total',(select count(*) from missing),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by school_date desc,teacher_id,kind) from page),'[]')) into result;
  return result;
end;
$$;
