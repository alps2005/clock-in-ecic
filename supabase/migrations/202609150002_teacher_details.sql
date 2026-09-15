-- Account deletion removes the Auth identity while retaining attendance records.
alter table public.profiles add column account_deleted_at timestamptz;
create or replace function public.admin_teachers(p_page integer default 0,p_search text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller public.profiles; result jsonb;
begin
  caller:=private.caller();
  if caller.role<>'admin' then raise exception 'ACCESS_DENIED'; end if;
  if p_page is null or p_page<0 or p_page>100000 or p_search is null or length(p_search)>120 then raise exception 'INVALID_FILTER'; end if;
  with teachers as materialized (
    select p.id,p.full_name,p.cedula,p.active,t.employed_from,t.employed_until
    from public.profiles p left join public.teachers t on t.id=p.id
    where p.role='teacher' and p.account_deleted_at is null and (btrim(p_search)='' or position(lower(btrim(p_search)) in lower(p.full_name))>0 or position(btrim(p_search) in p.cedula)>0)
  ), page as (select * from teachers order by full_name,id limit 25 offset p_page*25)
  select jsonb_build_object('total',(select count(*) from teachers),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by full_name,id) from page),'[]')) into result;
  return result;
end;
$$;
revoke all on function public.admin_teachers(integer,text) from public,anon;
grant execute on function public.admin_teachers(integer,text) to authenticated;


create function public.admin_teacher(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller public.profiles; result jsonb;
begin
  caller:=private.caller();
  if caller.role<>'admin' then raise exception 'ACCESS_DENIED'; end if;
  select jsonb_build_object('id',p.id,'full_name',p.full_name,'cedula',p.cedula,'active',p.active,
    'employed_from',t.employed_from,'employed_until',t.employed_until) into result
  from public.profiles p left join public.teachers t on t.id=p.id
  where p.id=p_id and p.role='teacher' and p.account_deleted_at is null;
  if result is null then raise exception 'TEACHER_NOT_FOUND'; end if;
  return result;
end;
$$;
create function public.admin_teacher_report(p_id uuid, p_from date, p_to date, p_page integer default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.profiles; t timestamptz; result jsonb;
begin
  v := private.caller(); t := private.server_now();
  if v.role<>'admin' then raise exception 'ACCESS_DENIED'; end if;
  if p_id is null or not exists(select 1 from public.profiles where id=p_id and role='teacher') then raise exception 'TEACHER_NOT_FOUND'; end if;
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>30 or p_page is null or p_page<0 or p_page>100000 then raise exception 'INVALID_FILTER'; end if;
  with rows as materialized (
    select * from private.daily_rows(p_from,p_to,p_id,'',t)
  ), totals as (
    select count(*) as expected, count(*) filter(where entry_status='on_time') as on_time,
      count(*) filter(where entry_status in ('late','late_pending')) as late,
      count(*) filter(where entry_status='absent') as absent,
      count(*) filter(where exit_status='missing') as missing_exit,
      count(*) filter(where exit_status='registered') as completed from rows
  ), page as (select * from rows order by school_date desc, full_name, teacher_id limit 25 offset p_page*25)
  select jsonb_build_object('as_of',t,'page',p_page,'page_size',25,'totals',(select to_jsonb(totals) from totals),
    'rows',coalesce((select jsonb_agg(to_jsonb(page) order by school_date desc,full_name,teacher_id) from page),'[]')) into result;
  return result;
end;
$$;

revoke all on function public.admin_teacher(uuid),public.admin_teacher_report(uuid,date,date,integer) from public,anon;
grant execute on function public.admin_teacher(uuid),public.admin_teacher_report(uuid,date,date,integer) to authenticated;

create function public.finish_teacher_delete(p_key text,p_token uuid,p_id uuid,p_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
  perform 1 from private.teacher_admin_locks where key=p_key and token=p_token and expires_at>clock_timestamp() for update;
  if not found then raise exception 'ACCOUNT_BUSY'; end if;
  select * into p from public.profiles where id=p_id for update;
  if p.role is distinct from 'teacher' or p.active or p.session_version<>p_version or p.auth_user_id is not null then raise exception 'ACCOUNT_CHANGED'; end if;
  update public.profiles set account_deleted_at=coalesce(account_deleted_at,private.server_now()) where id=p_id;
  update public.teachers set employed_until=least(coalesce(employed_until,'infinity'::date),
    greatest(employed_from,(private.server_now() at time zone 'America/Guayaquil')::date,
      (select max(school_date) from public.attendance_events where teacher_id=p_id))) where id=p_id;
end;
$$;
revoke all on function public.finish_teacher_delete(text,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.finish_teacher_delete(text,uuid,uuid,integer) to service_role;

-- Recreating an account for a retained teacher restores it to the directory.
create or replace function public.finish_teacher_admin(p_key text,p_token uuid,p_id uuid,p_version integer,
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
  update public.profiles set account_deleted_at=null,auth_user_id=p_auth_id,full_name=btrim(p_full_name),cedula=p_cedula,active=p_active where id=p_id;
end;
$$;
revoke all on function public.finish_teacher_admin(text,uuid,uuid,integer,uuid,text,text,date,date,boolean) from public,anon,authenticated;
grant execute on function public.finish_teacher_admin(text,uuid,uuid,integer,uuid,text,text,date,date,boolean) to service_role;

