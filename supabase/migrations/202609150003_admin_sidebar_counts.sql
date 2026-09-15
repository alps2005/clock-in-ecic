create function public.admin_sidebar_counts() returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller public.profiles;
begin
  caller := private.caller();
  if caller.role <> 'admin' then raise exception 'ACCESS_DENIED'; end if;
  return jsonb_build_object(
    'teachers', (select count(*) from public.profiles where role='teacher' and account_deleted_at is null),
    'justifications', (select count(*) from public.attendance_events where justification is not null),
    'notifications', (select (public.admin_notifications(0)->>'total')::integer)
  );
end;
$$;

revoke all on function public.admin_sidebar_counts() from public, anon;
grant execute on function public.admin_sidebar_counts() to authenticated;
