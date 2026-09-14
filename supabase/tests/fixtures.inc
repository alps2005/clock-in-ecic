insert into auth.users(id,email) values
 ('10000000-0000-0000-0000-000000000001','teacher-a@example.test'),
 ('10000000-0000-0000-0000-000000000002','teacher-b@example.test'),
 ('10000000-0000-0000-0000-000000000003','admin@example.test'),
 ('10000000-0000-0000-0000-000000000004','inactive@example.test');
insert into public.profiles(id,auth_user_id,cedula,full_name,role,active) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','0000000001','Teacher A','teacher',true),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','0000000002','Teacher B','teacher',true),
 ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','0000000003','Administrator','admin',true),
 ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000004','0000000004','Inactive Teacher','teacher',false);
insert into public.teachers(id,employed_from) select id,'2026-09-14' from public.profiles where role='teacher';
update public.attendance_policies set effective=daterange('2026-09-01',null,'[)');
select public.configure_checkpoint('30000000-0000-0000-0000-000000000001','Disposable fixture',
  'ecic:test-only:0000000000000000000000000000000000000000000000000000');
-- Test-only replacement. The production function always reads clock_timestamp().
create or replace function private.server_now() returns timestamptz language sql volatile set search_path='' as
 $$ select current_setting('test.school_time')::timestamptz; $$;
select set_config('test.school_time','2026-09-14T11:30:00Z',false);
