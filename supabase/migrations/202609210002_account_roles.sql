-- profiles is the application's user-account table; extend its existing role column.
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check
  (role in ('admin','teacher','substitute_teacher','secretary','academic_coordinator','vice_principal','principal'));
alter table public.profiles alter column role set default 'teacher';
alter table public.profiles alter column cedula drop not null;
alter table public.profiles add column username text;
create unique index profiles_username_unique on public.profiles(lower(username)) where username is not null;
alter table public.profiles add constraint profiles_username_check check (username is null or username ~ '^[A-Za-z][A-Za-z0-9_]{2,63}$');
alter table public.profiles add constraint profiles_login_check check (
  (role='admin' and (cedula is not null or username is not null)) or
  (role<>'admin' and cedula is not null and username is null)
);



create or replace function public.activate_profile(p_profile_id uuid, p_auth_user_id uuid, p_employed_from date default null)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id=p_profile_id for update;
  if p.id is null or p.active then raise exception 'PROFILE_NOT_PENDING'; end if;
  if not exists(select 1 from auth.users where id=p_auth_user_id and email=case when p.role='admin' and p.username is not null then lower(p.username)||'@admin.clock-in.invalid' else p.cedula||'@login.clock-in.invalid' end) then raise exception 'IDENTITY_MISMATCH'; end if;
  if p.role<>'admin' then
    if p_employed_from is null then raise exception 'EMPLOYMENT_REQUIRED'; end if;
    insert into public.teachers(id,employed_from) values(p.id,p_employed_from) on conflict(id) do nothing;
  end if;
  update public.profiles set auth_user_id=p_auth_user_id,active=true where id=p.id;
end;
$$;

create or replace function public.record_attendance(p_kind text, p_school_date date, p_prior_sequence integer,
  p_request_id uuid, p_qr text default null, p_justification text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.profiles; p public.attendance_policies; e public.attendance_events;
  t timestamptz; d date; local_time time; prior integer; fingerprint text; checkpoint uuid;
begin
  v := private.caller();
  if v.role = 'admin' then raise exception 'ACCESS_DENIED'; end if;
  -- Lock the profile row across devices, then recheck activation after any wait.
  select * into v from public.profiles where id = v.id for update;
  if v.role='admin' or not v.active or v.auth_user_id is distinct from auth.uid()
    or v.session_version::text is distinct from (auth.jwt()->'app_metadata'->>'ecic_session_version') then raise exception 'ACCESS_DENIED'; end if;
  if p_request_id is null or p_school_date is null or p_prior_sequence is null or p_kind is null
    or p_kind not in ('entry', 'late_entry', 'exit') then raise exception 'INVALID_REQUEST'; end if;
  if octet_length(coalesce(p_qr,'')) > 500 or octet_length(coalesce(p_justification,'')) > 40000 then raise exception 'INVALID_REQUEST'; end if;
  fingerprint := encode(sha256(convert_to(jsonb_build_array(p_kind,p_school_date,p_prior_sequence,p_qr,p_justification)::text,'UTF8')), 'hex');
  select * into e from public.attendance_events where teacher_id = v.id and request_id = p_request_id;
  if e.id is not null then
    if e.request_hash <> fingerprint then raise exception 'REQUEST_REUSED'; end if;
    return to_jsonb(e) - 'request_hash';
  end if;
  t := private.server_now(); d := (t at time zone 'America/Guayaquil')::date; local_time := (t at time zone 'America/Guayaquil')::time;
  if d <> p_school_date then raise exception 'STALE_DATE'; end if;
  select * into p from public.attendance_policies where d <@ effective;
  if p.id is null then raise exception 'SCHOOL_NOT_CONFIGURED'; end if;
  if not (extract(isodow from d)::int = any(p.weekdays)) or exists(select 1 from public.school_holidays where school_date = d)
    or not exists(select 1 from public.teachers where id=v.id and d>=employed_from and (employed_until is null or d<=employed_until)) then
    raise exception 'NOT_WORKING_DAY';
  end if;
  select coalesce(max(sequence_no),0) into prior from public.attendance_events where teacher_id=v.id and school_date=d;
  if prior <> p_prior_sequence or (p_kind in ('entry','late_entry') and prior <> 0) or (p_kind='exit' and prior <> 1) then raise exception 'STALE_STATE'; end if;
  if p_kind='entry' and (local_time < p.entry_opens or local_time > p.entry_closes) then raise exception 'ENTRY_CLOSED'; end if;
  if p_kind='exit' and (local_time < p.exit_opens or local_time > p.exit_closes) then raise exception 'EXIT_CLOSED'; end if;
  if p_kind='late_entry' then
    if local_time <= p.entry_closes then raise exception 'JUSTIFICATION_NOT_OPEN'; end if;
    if p_qr is not null or p_justification is null or length(btrim(p_justification))=0 or length(p_justification)>10000
      or private.word_count(p_justification) not between 1 and 250 then raise exception 'JUSTIFICATION_REQUIRED'; end if;
  else
    if p_justification is not null then raise exception 'INVALID_REQUEST'; end if;
    select c.id into checkpoint from public.checkpoints c join private.checkpoint_tokens s on s.checkpoint_id=c.id
      where c.active and s.token_hash=encode(sha256(convert_to(p_qr,'UTF8')),'hex');
    if checkpoint is null then raise exception 'INVALID_QR'; end if;
  end if;
  insert into public.attendance_events(teacher_id,policy_id,checkpoint_id,kind,occurred_at,school_date,sequence_no,request_id,request_hash,justification)
    values(v.id,p.id,checkpoint,p_kind,t,d,prior+1,p_request_id,fingerprint,p_justification) returning * into e;
  return to_jsonb(e) - 'request_hash';
end;
$$;

create or replace function public.attendance_report(p_from date, p_to date, p_page integer default 0, p_search text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.profiles; t timestamptz; result jsonb;
begin
  v := private.caller(); t := private.server_now();
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>30 or p_page is null or p_page<0 or p_page>100000
    or p_search is null or length(p_search)>120 then raise exception 'INVALID_FILTER'; end if;
  with rows as materialized (
    select * from private.daily_rows(p_from,p_to,case when v.role<>'admin' then v.id else null end,
      case when v.role<>'admin' then '' else btrim(p_search) end,t)
  ), marks as (
    select m.kind, m.marked_at,
      (r.school_date + m.opens) at time zone p.timezone as opens_at,
      (r.school_date + m.closes) at time zone p.timezone as closes_at
    from rows r join public.attendance_policies p on r.school_date <@ p.effective
    cross join lateral (values
      ('entry',r.entry_at,p.entry_opens,p.entry_closes),
      ('exit',r.exit_at,p.exit_opens,p.exit_closes)
    ) m(kind,marked_at,opens,closes)
    where m.marked_at is not null
  ), totals as (
    select count(*) as expected,
      (select count(*) from marks where marked_at between opens_at and closes_at) as on_time,
      (select count(*) from marks where marked_at > closes_at) as late,
      (select count(*) from marks where kind='entry' and marked_at between opens_at and closes_at) as entry_on_time,
      (select count(*) from marks where kind='entry' and marked_at > closes_at) as entry_late,
      (select count(*) from marks where kind='exit' and marked_at between opens_at and closes_at) as exit_on_time,
      (select count(*) from marks where kind='exit' and marked_at > closes_at) as exit_late,
      count(*) filter(where entry_status='missing_entry') as missing_entry,
      count(*) filter(where entry_status='absent') as absent,
      count(*) filter(where exit_status='missing') as missing_exit,
      count(*) filter(where exit_status='registered') as completed from rows
  ), page as (select * from rows order by school_date desc, full_name, teacher_id limit 25 offset p_page*25)
  select jsonb_build_object('as_of',t,'page',p_page,'page_size',25,'totals',(select to_jsonb(totals) from totals),
    'rows',coalesce((select jsonb_agg(to_jsonb(page) order by school_date desc,full_name,teacher_id) from page),'[]')) into result;
  return result;
end;
$$;

create or replace function public.admin_teachers(p_page integer default 0,p_search text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller public.profiles; result jsonb;
begin
  caller:=private.caller();
  if caller.role<>'admin' then raise exception 'ACCESS_DENIED'; end if;
  if p_page is null or p_page<0 or p_page>100000 or p_search is null or length(p_search)>120 then raise exception 'INVALID_FILTER'; end if;
  with teachers as materialized (
    select p.id,p.full_name,p.cedula,p.role,p.active,t.employed_from,t.employed_until
    from public.profiles p left join public.teachers t on t.id=p.id
    where p.role<>'admin' and p.account_deleted_at is null and (btrim(p_search)='' or position(lower(btrim(p_search)) in lower(p.full_name))>0 or position(btrim(p_search) in p.cedula)>0)
  ), page as (select * from teachers order by full_name,id limit 25 offset p_page*25)
  select jsonb_build_object('total',(select count(*) from teachers),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by full_name,id) from page),'[]')) into result;
  return result;
end;
$$;

create or replace function public.admin_teacher(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller public.profiles; result jsonb;
begin
  caller:=private.caller();
  if caller.role<>'admin' then raise exception 'ACCESS_DENIED'; end if;
  select jsonb_build_object('id',p.id,'full_name',p.full_name,'cedula',p.cedula,'active',p.active,'role',p.role,
    'employed_from',t.employed_from,'employed_until',t.employed_until) into result
  from public.profiles p left join public.teachers t on t.id=p.id
  where p.id=p_id and p.role<>'admin' and p.account_deleted_at is null;
  if result is null then raise exception 'TEACHER_NOT_FOUND'; end if;
  return result;
end;
$$;

create or replace function public.admin_teacher_report(p_id uuid, p_from date, p_to date, p_page integer default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.profiles; t timestamptz; result jsonb;
begin
  v := private.caller(); t := private.server_now();
  if v.role<>'admin' then raise exception 'ACCESS_DENIED'; end if;
  if p_id is null or not exists(select 1 from public.profiles where id=p_id and role<>'admin') then raise exception 'TEACHER_NOT_FOUND'; end if;
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>30 or p_page is null or p_page<0 or p_page>100000 then raise exception 'INVALID_FILTER'; end if;
  with rows as materialized (
    select * from private.daily_rows(p_from,p_to,p_id,'',t)
  ), marks as (
    select m.kind, m.marked_at,
      (r.school_date + m.opens) at time zone p.timezone as opens_at,
      (r.school_date + m.closes) at time zone p.timezone as closes_at
    from rows r join public.attendance_policies p on r.school_date <@ p.effective
    cross join lateral (values
      ('entry',r.entry_at,p.entry_opens,p.entry_closes),
      ('exit',r.exit_at,p.exit_opens,p.exit_closes)
    ) m(kind,marked_at,opens,closes)
    where m.marked_at is not null
  ), totals as (
    select count(*) as expected,
      (select count(*) from marks where marked_at between opens_at and closes_at) as on_time,
      (select count(*) from marks where marked_at > closes_at) as late,
      (select count(*) from marks where kind='entry' and marked_at between opens_at and closes_at) as entry_on_time,
      (select count(*) from marks where kind='entry' and marked_at > closes_at) as entry_late,
      (select count(*) from marks where kind='exit' and marked_at between opens_at and closes_at) as exit_on_time,
      (select count(*) from marks where kind='exit' and marked_at > closes_at) as exit_late,
      count(*) filter(where entry_status='missing_entry') as missing_entry,
      count(*) filter(where entry_status='absent') as absent,
      count(*) filter(where exit_status='missing') as missing_exit,
      count(*) filter(where exit_status='registered') as completed from rows
  ), page as (select * from rows order by school_date desc, full_name, teacher_id limit 25 offset p_page*25)
  select jsonb_build_object('as_of',t,'page',p_page,'page_size',25,'totals',(select to_jsonb(totals) from totals),
    'rows',coalesce((select jsonb_agg(to_jsonb(page) order by school_date desc,full_name,teacher_id) from page),'[]')) into result;
  return result;
end;
$$;

create or replace function public.finish_teacher_delete(p_key text,p_token uuid,p_id uuid,p_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
  perform 1 from private.teacher_admin_locks where key=p_key and token=p_token and expires_at>clock_timestamp() for update;
  if not found then raise exception 'ACCOUNT_BUSY'; end if;
  select * into p from public.profiles where id=p_id for update;
  if (p.id is null or p.role='admin') or p.active or p.session_version<>p_version or p.auth_user_id is not null then raise exception 'ACCOUNT_CHANGED'; end if;
  update public.profiles set account_deleted_at=coalesce(account_deleted_at,private.server_now()) where id=p_id;
  update public.teachers set employed_until=least(coalesce(employed_until,'infinity'::date),
    greatest(employed_from,(private.server_now() at time zone 'America/Guayaquil')::date,
      (select max(school_date) from public.attendance_events where teacher_id=p_id))) where id=p_id;
end;
$$;

drop function public.finish_teacher_admin(text,uuid,uuid,integer,uuid,text,text,date,date,boolean);

create or replace function public.finish_teacher_admin(p_key text,p_token uuid,p_id uuid,p_version integer,
  p_auth_id uuid,p_full_name text,p_cedula text,p_from date,p_until date,p_active boolean,p_role text default null) returns void
language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
  perform 1 from private.teacher_admin_locks where key=p_key and token=p_token and expires_at>clock_timestamp() for update;
  if not found then raise exception 'ACCOUNT_BUSY'; end if;
  select * into p from public.profiles where id=p_id for update;
  if (p.id is null or p.role='admin') or p.active or p.session_version<>p_version then raise exception 'ACCOUNT_CHANGED'; end if;
  if p_role is not null and p_role not in ('teacher','substitute_teacher','secretary','academic_coordinator','vice_principal','principal') then raise exception 'INVALID_REQUEST'; end if;
  if not exists(select 1 from auth.users where id=p_auth_id and email=p_cedula||'@login.clock-in.invalid') then raise exception 'IDENTITY_MISMATCH'; end if;
  if p_from is null or (p_until is not null and p_until<p_from) then raise exception 'EMPLOYMENT_REQUIRED'; end if;
  if exists(select 1 from public.attendance_events where teacher_id=p_id and (school_date<p_from or school_date>p_until)) then raise exception 'EMPLOYMENT_HAS_HISTORY'; end if;
  insert into public.teachers(id,employed_from,employed_until) values(p_id,p_from,p_until)
    on conflict(id) do update set employed_from=excluded.employed_from,employed_until=excluded.employed_until;
  update public.profiles set role=coalesce(p_role,p.role),account_deleted_at=null,auth_user_id=p_auth_id,full_name=btrim(p_full_name),cedula=p_cedula,active=p_active where id=p_id;
end;
$$;
revoke all on function public.finish_teacher_admin(text,uuid,uuid,integer,uuid,text,text,date,date,boolean,text) from public,anon,authenticated;
grant execute on function public.finish_teacher_admin(text,uuid,uuid,integer,uuid,text,text,date,date,boolean,text) to service_role;

create or replace function public.admin_sidebar_counts() returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller public.profiles;
begin
  caller := private.caller();
  if caller.role <> 'admin' then raise exception 'ACCESS_DENIED'; end if;
  return jsonb_build_object(
    'teachers', (select count(*) from public.profiles where role<>'admin' and account_deleted_at is null),
    'justifications', (select count(*) from public.attendance_events where justification is not null),
    'notifications', (select (public.admin_notifications(0)->>'total')::integer)
  );
end;
$$;
