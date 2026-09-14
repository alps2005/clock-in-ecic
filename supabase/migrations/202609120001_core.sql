-- Fresh application schema. No legacy data, credentials or configuration.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  cedula text not null unique check (cedula ~ '^[0-9]{10}$'),
  full_name text not null check (length(btrim(full_name)) between 2 and 120),
  role text not null check (role in ('teacher', 'admin')),
  active boolean not null default false,
  session_version integer not null default 1 check (session_version > 0),
  created_at timestamptz not null default now()
);
create table public.teachers (
  id uuid primary key references public.profiles(id) on delete restrict,
  employed_from date not null,
  employed_until date,
  check (employed_until is null or employed_until >= employed_from)
);
create table public.attendance_policies (
  id uuid primary key default gen_random_uuid(),
  effective daterange not null check (not isempty(effective) and not lower_inf(effective)),
  timezone text not null check (timezone = 'America/Guayaquil'),
  weekdays integer[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]),
  entry_opens time not null,
  entry_closes time not null,
  exit_opens time not null,
  exit_closes time not null,
  check (entry_opens < entry_closes and entry_closes < exit_opens and exit_opens < exit_closes),
  exclude using gist (effective with &&)
);
create table public.school_holidays (
  school_date date primary key,
  label text not null check (length(btrim(label)) between 1 and 120)
);
create table public.checkpoints (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(btrim(label)) between 1 and 120),
  active boolean not null default false
);
create table private.checkpoint_tokens (
  checkpoint_id uuid primary key references public.checkpoints(id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$')
);
-- Match JavaScript Unicode whitespace so the browser and server count the same words.
create function private.word_count(p_text text) returns integer
language sql immutable set search_path = '' as $$
  select case when btrim(normalized)='' then 0 else cardinality(string_to_array(btrim(normalized),' ')) end
  from (select regexp_replace(coalesce(p_text,''), U&'[\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF]+',' ','g') as normalized) s;
$$;

create table public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  policy_id uuid not null references public.attendance_policies(id) on delete restrict,
  checkpoint_id uuid references public.checkpoints(id) on delete restrict,
  kind text not null check (kind in ('entry', 'late_entry', 'exit')),
  occurred_at timestamptz not null,
  school_date date not null,
  sequence_no integer not null check (sequence_no in (1,2)),
  request_id uuid not null,
  request_hash text not null,
  justification text,
  check ((sequence_no = 1 and kind in ('entry', 'late_entry')) or (sequence_no = 2 and kind = 'exit')),
  check ((kind = 'late_entry' and checkpoint_id is null and justification is not null)
    or (kind <> 'late_entry' and checkpoint_id is not null and justification is null)),
  check (justification is null or (length(btrim(justification)) > 0 and length(justification) <= 10000
    and private.word_count(justification) between 1 and 250)),
  unique (teacher_id, request_id),
  unique (teacher_id, school_date, sequence_no)
);
create index attendance_events_date_teacher on public.attendance_events(school_date, teacher_id);
create index profiles_auth_active on public.profiles(auth_user_id) where active;

create function private.caller() returns public.profiles
language plpgsql stable security definer set search_path = '' as $$
declare v public.profiles;
begin
  select * into v from public.profiles where auth_user_id = (select auth.uid()) and active
    and session_version::text = (select auth.jwt()->'app_metadata'->>'ecic_session_version');
  if v.id is null then raise exception 'ACCESS_DENIED'; end if;
  return v;
end;
$$;
create function private.can_read(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.auth_user_id = (select auth.uid())
    and p.active and p.session_version::text=(select auth.jwt()->'app_metadata'->>'ecic_session_version')
    and (p.id = p_id or p.role = 'admin'));
$$;
grant usage on schema private to authenticated;
grant execute on function private.can_read(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.teachers enable row level security;
alter table public.attendance_policies enable row level security;
alter table public.school_holidays enable row level security;
alter table public.checkpoints enable row level security;
alter table public.attendance_events enable row level security;
alter table private.checkpoint_tokens enable row level security;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;
grant select on public.profiles, public.teachers, public.attendance_events to authenticated;
grant all on public.profiles, public.teachers, public.attendance_policies, public.school_holidays,
 public.checkpoints, public.attendance_events to service_role;
create policy profiles_read on public.profiles for select to authenticated using (private.can_read(id));
create policy teachers_read on public.teachers for select to authenticated using (private.can_read(id));
create policy events_read on public.attendance_events for select to authenticated using (private.can_read(teacher_id));

-- Rules used by history are immutable, except closing the future effective range.
create function private.protect_policy() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists(select 1 from public.attendance_events where policy_id = old.id) then
    if (to_jsonb(new) - 'effective') is distinct from (to_jsonb(old) - 'effective')
      or exists(select 1 from public.attendance_events where policy_id = old.id and not (school_date <@ new.effective)) then
      raise exception 'POLICY_HAS_HISTORY';
    end if;
  end if;
  return new;
end;
$$;
create trigger protect_policy before update on public.attendance_policies for each row execute function private.protect_policy();

-- Unexposed clock wrapper allows deterministic substitution ONLY in disposable tests.
create function private.server_now() returns timestamptz
language sql volatile set search_path = '' as $$ select clock_timestamp(); $$;

create function public.app_context() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.profiles; p public.attendance_policies; t timestamptz; d date; events jsonb; working boolean;
begin
  v := private.caller(); t := private.server_now(); d := (t at time zone 'America/Guayaquil')::date;
  select * into p from public.attendance_policies where d <@ effective;
  working := p.id is not null and extract(isodow from d)::int = any(p.weekdays)
    and not exists(select 1 from public.school_holidays where school_date = d)
    and exists(select 1 from public.teachers where id = v.id and d >= employed_from and (employed_until is null or d <= employed_until));
  select coalesce(jsonb_agg(to_jsonb(e) - 'request_hash' order by e.sequence_no), '[]') into events
    from public.attendance_events e where teacher_id = v.id and school_date = d;
  return jsonb_build_object('profile', to_jsonb(v), 'server_time', t, 'school_date', d,
    'policy', to_jsonb(p), 'working_day', working, 'events', events);
end;
$$;

create function public.record_attendance(p_kind text, p_school_date date, p_prior_sequence integer,
  p_request_id uuid, p_qr text default null, p_justification text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.profiles; p public.attendance_policies; e public.attendance_events;
  t timestamptz; d date; local_time time; prior integer; fingerprint text; checkpoint uuid;
begin
  v := private.caller();
  if v.role <> 'teacher' then raise exception 'ACCESS_DENIED'; end if;
  -- Lock the profile row across devices, then recheck activation after any wait.
  select * into v from public.profiles where id = v.id for update;
  if not v.active or v.auth_user_id is distinct from auth.uid()
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

-- One row per eligible teacher/day, with all statuses derived using a single report boundary.
create function private.daily_rows(p_from date, p_to date, p_teacher uuid, p_search text, p_as_of timestamptz)
returns table(teacher_id uuid, full_name text, cedula text, school_date date, entry_at timestamptz,
  exit_at timestamptz, justification text, entry_status text, exit_status text, worked_minutes integer)
language sql stable security definer set search_path = '' as $$
  select t.id, pr.full_name, pr.cedula, d.day::date, a.occurred_at, b.occurred_at, a.justification,
    case when a.kind='entry' then 'on_time' when a.kind='late_entry' then 'late'
      when p_as_of > ((d.day::date + pol.exit_closes) at time zone pol.timezone) then 'absent'
      when p_as_of > ((d.day::date + pol.entry_closes) at time zone pol.timezone) then 'late_pending'
      else 'pending' end,
    case when b.id is not null then 'registered'
      when a.id is not null and p_as_of > ((d.day::date + pol.exit_closes) at time zone pol.timezone) then 'missing'
      else 'pending' end,
    case when b.id is not null then floor(extract(epoch from (b.occurred_at-a.occurred_at))/60)::int else null end
  from public.teachers t join public.profiles pr on pr.id=t.id
  cross join generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d(day)
  join public.attendance_policies pol on d.day::date <@ pol.effective
  left join public.attendance_events a on a.teacher_id=t.id and a.school_date=d.day::date and a.sequence_no=1 and a.occurred_at<=p_as_of
  left join public.attendance_events b on b.teacher_id=t.id and b.school_date=d.day::date and b.sequence_no=2 and b.occurred_at<=p_as_of
  where (p_teacher is null or t.id=p_teacher)
    and (p_search='' or position(lower(p_search) in lower(pr.full_name))>0 or position(p_search in pr.cedula)>0)
    and d.day::date>=t.employed_from and (t.employed_until is null or d.day::date<=t.employed_until)
    and d.day::date<=(p_as_of at time zone pol.timezone)::date
    and extract(isodow from d.day)::int=any(pol.weekdays)
    and not exists(select 1 from public.school_holidays h where h.school_date=d.day::date);
$$;
create function public.attendance_report(p_from date, p_to date, p_page integer default 0, p_search text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.profiles; t timestamptz; result jsonb;
begin
  v := private.caller(); t := private.server_now();
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>30 or p_page is null or p_page<0 or p_page>100000
    or p_search is null or length(p_search)>120 then raise exception 'INVALID_FILTER'; end if;
  with rows as materialized (
    select * from private.daily_rows(p_from,p_to,case when v.role='teacher' then v.id else null end,
      case when v.role='teacher' then '' else btrim(p_search) end,t)
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
-- Persistent source events make these notifications available even if nobody was online at closing.
create function public.admin_notifications(p_page integer default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.profiles; t timestamptz; result jsonb;
begin
  v := private.caller(); if v.role<>'admin' then raise exception 'ACCESS_DENIED'; end if;
  if p_page is null or p_page<0 or p_page>100000 then raise exception 'INVALID_FILTER'; end if;
  t:=private.server_now();
  with missing as materialized (
    select e.teacher_id,pr.full_name,e.school_date,e.occurred_at as entry_at
    from public.attendance_events e join public.profiles pr on pr.id=e.teacher_id
    join public.attendance_policies pol on pol.id=e.policy_id
    where e.sequence_no=1 and t>((e.school_date+pol.exit_closes) at time zone pol.timezone)
      and not exists(select 1 from public.attendance_events x where x.teacher_id=e.teacher_id and x.school_date=e.school_date and x.sequence_no=2)
  ), page as (select * from missing order by school_date desc,teacher_id limit 25 offset p_page*25)
  select jsonb_build_object('total',(select count(*) from missing),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by school_date desc,teacher_id) from page),'[]')) into result;
  return result;
end;
$$;

-- Trusted operator only. Token is high-entropy and never readable by the browser API.
create function public.configure_checkpoint(p_id uuid, p_label text, p_payload text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if length(p_payload)<40 or length(p_payload)>500 then raise exception 'INVALID_QR'; end if;
  insert into public.checkpoints(id,label,active) values(p_id,p_label,true)
    on conflict(id) do update set label=excluded.label,active=true;
  insert into private.checkpoint_tokens values(p_id,encode(sha256(convert_to(p_payload,'UTF8')),'hex'))
    on conflict(checkpoint_id) do update set token_hash=excluded.token_hash;
end;
$$;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.can_read(uuid) to authenticated;
revoke all on function public.app_context(), public.record_attendance(text,date,integer,uuid,text,text),
 public.attendance_report(date,date,integer,text),public.admin_notifications(integer),public.configure_checkpoint(uuid,text,text) from public,anon,authenticated;
grant execute on function public.app_context(),public.record_attendance(text,date,integer,uuid,text,text),
 public.attendance_report(date,date,integer,text),public.admin_notifications(integer) to authenticated;
grant execute on function public.configure_checkpoint(uuid,text,text) to service_role;
