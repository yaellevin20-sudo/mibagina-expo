-- =============================================================================
-- Purge expired check-ins older than 60 days (nightly cron)
-- No feature reads historical expired rows — all RPCs filter on active status.
-- =============================================================================

do $$
begin
  perform cron.unschedule('checkin-retention');
  exception when others then null;
end $$;

select cron.schedule(
  'checkin-retention',
  '0 2 * * *',   -- 02:00 UTC daily
  $$
    delete from check_ins
    where status = 'expired'
      and expires_at < now() - interval '60 days';
  $$
);
