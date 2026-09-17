-- Separate entry and exit timeliness totals before pagination.
-- Retain combined totals for compatibility; preserve daily absence and marking rules.
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

