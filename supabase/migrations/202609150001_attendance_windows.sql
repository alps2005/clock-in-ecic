-- Revised school schedule requested on 2026-09-15.
-- The linked policy has no attendance history. The existing protect_policy trigger
-- also prevents changing recorded policy history if records arrive before this runs.
update public.attendance_policies
set entry_closes = '06:40:00', exit_opens = '12:40:00'
where upper_inf(effective)
  and timezone = 'America/Guayaquil'
  and entry_opens = '06:00:00' and entry_closes = '06:45:00'
  and exit_opens = '12:45:00' and exit_closes = '13:30:00';
