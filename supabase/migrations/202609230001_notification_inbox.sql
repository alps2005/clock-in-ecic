-- Shared administrator inbox. Attendance remains immutable.
create table private.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id),
  school_date date not null,
  kind text not null check (kind in ('entry','exit')),
  read_at timestamptz,
  unique (teacher_id, school_date, kind)
);
create index admin_notifications_read_at on private.admin_notifications(read_at) where read_at is not null;
-- A per-teacher watermark prevents expired notices from being regenerated, without
-- keeping deleted notification records. New teachers still get a historical backfill.
create table private.notification_scan (
  teacher_id uuid primary key references public.teachers(id),
  scanned_through date not null
);
alter table private.admin_notifications enable row level security;
alter table private.notification_scan enable row level security;
revoke all on private.admin_notifications, private.notification_scan from public, anon, authenticated;

create function private.sync_admin_notifications() returns void
language plpgsql security definer set search_path='' as $$
declare t timestamptz; today date;
begin
  lock table private.notification_scan in share row exclusive mode;
  t := private.server_now(); today := (t at time zone 'America/Guayaquil')::date;
  with days as materialized (
    select d.* from public.teachers teacher
    left join private.notification_scan s on s.teacher_id=teacher.id
    cross join lateral private.daily_rows(coalesce(s.scanned_through,teacher.employed_from),today,teacher.id,'',t) d
  ), missed as (
    select teacher_id,school_date,'entry'::text as kind from days where entry_status in ('late','late_pending','missing_entry','absent')
    union all
    select teacher_id,school_date,'exit'::text from days where exit_status='missing'
  )
  insert into private.admin_notifications(teacher_id,school_date,kind)
    select teacher_id,school_date,kind from missed on conflict (teacher_id,school_date,kind) do nothing;
  insert into private.notification_scan(teacher_id,scanned_through)
    select id,today from public.teachers
    on conflict (teacher_id) do update set scanned_through=greatest(private.notification_scan.scanned_through,excluded.scanned_through);
  delete from private.admin_notifications where read_at <= t - interval '15 days';
end;
$$;
revoke all on function private.sync_admin_notifications() from public,anon,authenticated;

create or replace function public.admin_notifications(p_page integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller public.profiles; result jsonb;
begin
  caller:=private.caller(); if caller.role<>'admin' then raise exception 'ACCESS_DENIED'; end if;
  if p_page is null or p_page<0 or p_page>100000 then raise exception 'INVALID_FILTER'; end if;
  perform private.sync_admin_notifications();
  with page as (
    select n.id,n.teacher_id,pr.full_name,pr.cedula,n.school_date,n.kind,n.read_at,
      a.occurred_at as entry_at, pol.entry_closes, pol.exit_closes,
      n.read_at + interval '15 days' as expires_at
    from private.admin_notifications n
    join public.profiles pr on pr.id=n.teacher_id
    join public.attendance_policies pol on n.school_date <@ pol.effective
    left join public.attendance_events a on a.teacher_id=n.teacher_id and a.school_date=n.school_date and a.sequence_no=1
    order by n.school_date desc,n.teacher_id,n.kind limit 25 offset p_page*25
  )
  select jsonb_build_object('total',(select count(*) from private.admin_notifications),
    'unread',(select count(*) from private.admin_notifications where read_at is null),
    'rows',coalesce((select jsonb_agg(to_jsonb(page) order by school_date desc,teacher_id,kind) from page),'[]')) into result;
  return result;
end;
$$;

create function public.admin_read_notification(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller public.profiles; result jsonb;
begin
  caller:=private.caller(); if caller.role<>'admin' then raise exception 'ACCESS_DENIED'; end if;
  if p_id is null then raise exception 'INVALID_REQUEST'; end if;
  update private.admin_notifications set read_at=coalesce(read_at,private.server_now())
    where id=p_id returning jsonb_build_object('id',id,'read_at',read_at) into result;
  -- An already-expired notice can be closed safely from a stale tab.
  return coalesce(result,jsonb_build_object('id',p_id,'deleted',true));
end;
$$;
revoke all on function public.admin_read_notification(uuid) from public,anon,authenticated;
grant execute on function public.admin_read_notification(uuid) to authenticated;

create or replace function public.admin_sidebar_counts() returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller public.profiles; notices jsonb;
begin
  caller:=private.caller(); if caller.role<>'admin' then raise exception 'ACCESS_DENIED'; end if;
  notices:=public.admin_notifications(0);
  return jsonb_build_object(
    'teachers',(select count(*) from public.profiles where role<>'admin' and account_deleted_at is null),
    'justifications',(select count(*) from public.attendance_events where justification is not null),
    'notifications',(notices->>'unread')::integer);
end;
$$;
