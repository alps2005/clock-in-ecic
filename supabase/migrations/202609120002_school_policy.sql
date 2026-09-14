-- User-approved schedule. Effective from installation; operational records start empty.
insert into public.attendance_policies(effective,timezone,weekdays,entry_opens,entry_closes,exit_opens,exit_closes)
values(daterange((now() at time zone 'America/Guayaquil')::date,null,'[)'),
  'America/Guayaquil',array[1,2,3,4,5],'06:00','06:45','12:45','13:30');
