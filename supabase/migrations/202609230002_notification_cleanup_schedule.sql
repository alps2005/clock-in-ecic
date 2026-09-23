-- Run even when no administrator has the application open.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('ecic-notification-retention', '* * * * *', 'select private.sync_admin_notifications()');
