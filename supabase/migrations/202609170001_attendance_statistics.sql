-- Timeliness counts individual entry and exit marks against their respective windows.
-- Missing marks and absences count teacher-days; unmarked entries are never late marks.
-- A day with no marks becomes an absence only after its exit window closes.
-- Exit-only records are distinct from days without either mark.
create or replace function private.daily_rows(p_from date, p_to date, p_teacher uuid, p_search text, p_as_of timestamptz)
returns table(teacher_id uuid, full_name text, cedula text, school_date date, entry_at timestamptz,
  exit_at timestamptz, justification text, entry_status text, exit_status text, worked_minutes integer)
language sql stable security definer set search_path = '' as $$
  select t.id, pr.full_name, pr.cedula, d.day::date, a.occurred_at, b.occurred_at, a.justification,
    case when a.kind='entry' then 'on_time' when a.kind='late_entry' then 'late'
      when b.id is not null then 'missing_entry'
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

create or replace function public.attendance_report(p_from date, p_to date, p_page integer default 0, p_search text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.profiles; t timestamptz; result jsonb;
begin
  v := private.caller(); t := private.server_now();
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>30 or p_page is null or p_page<0 or p_page>100000
    or p_search is null or length(p_search)>120 then raise exception 'INVALID_FILTER'; end if;
  with rows as materialized (
    select * from private.daily_rows(p_from,p_to,case when v.role='teacher' then v.id else null end,
      case when v.role='teacher' then '' else btrim(p_search) end,t)
  ), marks as (
    select m.marked_at,
      (r.school_date + m.opens) at time zone p.timezone as opens_at,
      (r.school_date + m.closes) at time zone p.timezone as closes_at
    from rows r join public.attendance_policies p on r.school_date <@ p.effective
    cross join lateral (values
      (r.entry_at,p.entry_opens,p.entry_closes),
      (r.exit_at,p.exit_opens,p.exit_closes)
    ) m(marked_at,opens,closes)
    where m.marked_at is not null
  ), totals as (
    select count(*) as expected,
      (select count(*) from marks where marked_at between opens_at and closes_at) as on_time,
      (select count(*) from marks where marked_at > closes_at) as late,
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

create or replace function public.admin_teacher_report(p_id uuid, p_from date, p_to date, p_page integer default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.profiles; t timestamptz; result jsonb;
begin
  v := private.caller(); t := private.server_now();
  if v.role<>'admin' then raise exception 'ACCESS_DENIED'; end if;
  if p_id is null or not exists(select 1 from public.profiles where id=p_id and role='teacher') then raise exception 'TEACHER_NOT_FOUND'; end if;
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>30 or p_page is null or p_page<0 or p_page>100000 then raise exception 'INVALID_FILTER'; end if;
  with rows as materialized (
    select * from private.daily_rows(p_from,p_to,p_id,'',t)
  ), marks as (
    select m.marked_at,
      (r.school_date + m.opens) at time zone p.timezone as opens_at,
      (r.school_date + m.closes) at time zone p.timezone as closes_at
    from rows r join public.attendance_policies p on r.school_date <@ p.effective
    cross join lateral (values
      (r.entry_at,p.entry_opens,p.entry_closes),
      (r.exit_at,p.exit_opens,p.exit_closes)
    ) m(marked_at,opens,closes)
    where m.marked_at is not null
  ), totals as (
    select count(*) as expected,
      (select count(*) from marks where marked_at between opens_at and closes_at) as on_time,
      (select count(*) from marks where marked_at > closes_at) as late,
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
    select teacher_id,full_name,cedula,school_date,entry_at,'entry'::text as kind from days where entry_status in ('late','late_pending','missing_entry','absent')
    union all
    select teacher_id,full_name,cedula,school_date,entry_at,'exit'::text as kind from days where exit_status='missing'
  ), page as (select * from missing order by school_date desc,teacher_id,kind limit 25 offset p_page*25)
  select jsonb_build_object('total',(select count(*) from missing),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by school_date desc,teacher_id,kind) from page),'[]')) into result;
  return result;
end;
$$;
