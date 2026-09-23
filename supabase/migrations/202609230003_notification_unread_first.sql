-- Sort the shared inbox before pagination so both views put read notices last.
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
    order by (n.read_at is not null),n.school_date desc,n.teacher_id,n.kind limit 25 offset p_page*25
  )
  select jsonb_build_object('total',(select count(*) from private.admin_notifications),
    'unread',(select count(*) from private.admin_notifications where read_at is null),
    'rows',coalesce((select jsonb_agg(to_jsonb(page) order by (read_at is not null),school_date desc,teacher_id,kind) from page),'[]')) into result;
  return result;
end;
$$;
