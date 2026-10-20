-- Additive migration: preserves every existing Booking record.
create table if not exists booking_working_hours (
  business_id uuid not null references booking_businesses(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  primary key (business_id, weekday),
  check (opens_at < closes_at)
);
create table if not exists booking_breaks (
  id uuid primary key,
  business_id uuid not null references booking_businesses(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  check (starts_at < ends_at)
);
create table if not exists booking_blocked_dates (
  business_id uuid not null references booking_businesses(id) on delete cascade,
  blocked_on date not null,
  primary key (business_id, blocked_on)
);
alter table booking_appointments add column if not exists ends_at timestamptz;
update booking_appointments a
set ends_at = a.starts_at + make_interval(mins => s.duration_minutes + s.buffer_minutes)
from booking_services s
where s.id = a.service_id and a.ends_at is null;
alter table booking_appointments alter column ends_at set not null;
create extension if not exists btree_gist;
alter table booking_appointments drop constraint if exists booking_confirmed_appointments_do_not_overlap;
alter table booking_appointments add constraint booking_confirmed_appointments_do_not_overlap
  exclude using gist (business_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
  where (status = 'Confirmed');
