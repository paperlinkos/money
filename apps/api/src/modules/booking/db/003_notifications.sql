-- Additive notification foundation. Delivery is intentionally handled separately
-- so booking transactions never depend on an external email provider.
create table if not exists booking_notification_preferences (
  business_id uuid primary key references booking_businesses(id) on delete cascade,
  provider_request_emails boolean not null default true,
  client_status_emails boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists booking_notification_outbox (
  id bigserial primary key,
  business_id uuid not null references booking_businesses(id) on delete cascade,
  appointment_id uuid not null references booking_appointments(id) on delete cascade,
  event_type text not null check (event_type in ('booking_requested', 'booking_confirmed', 'booking_rescheduled', 'booking_cancelled')),
  channel text not null default 'email' check (channel in ('email', 'telegram')),
  recipient text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists booking_notification_outbox_pending
  on booking_notification_outbox(status, created_at)
  where status = 'pending';

create index if not exists booking_notification_outbox_appointment
  on booking_notification_outbox(appointment_id, created_at desc);

create or replace function booking_queue_notification()
returns trigger
language plpgsql
as $$
declare
  recipient_email text;
  provider_name text;
  service_name text;
  preferences booking_notification_preferences%rowtype;
begin
  insert into booking_notification_preferences(business_id)
  values (new.business_id)
  on conflict (business_id) do nothing;

  select * into preferences
  from booking_notification_preferences
  where business_id = new.business_id;

  select b.name, s.name into provider_name, service_name
  from booking_businesses b
  join booking_services s on s.id = new.service_id
  where b.id = new.business_id;

  if TG_OP = 'INSERT' and preferences.provider_request_emails then
    select u.email into recipient_email
    from booking_businesses b
    join platform_users u on u.id = b.user_id
    where b.id = new.business_id;

    if recipient_email is not null then
      insert into booking_notification_outbox(business_id, appointment_id, event_type, recipient, payload)
      values (new.business_id, new.id, 'booking_requested', recipient_email, jsonb_build_object(
        'businessName', provider_name,
        'serviceName', service_name,
        'startsAt', new.starts_at,
        'reference', new.reference
      ));
    end if;
  end if;

  if TG_OP = 'UPDATE' and preferences.client_status_emails then
    select c.email into recipient_email from booking_customers c where c.id = new.customer_id;
    if recipient_email is not null and new.starts_at is distinct from old.starts_at then
      insert into booking_notification_outbox(business_id, appointment_id, event_type, recipient, payload)
      values (new.business_id, new.id, 'booking_rescheduled', recipient_email, jsonb_build_object(
        'businessName', provider_name,
        'serviceName', service_name,
        'startsAt', new.starts_at,
        'reference', new.reference
      ));
    elsif recipient_email is not null and new.status is distinct from old.status and new.status = 'Confirmed' then
      insert into booking_notification_outbox(business_id, appointment_id, event_type, recipient, payload)
      values (new.business_id, new.id, 'booking_confirmed', recipient_email, jsonb_build_object(
        'businessName', provider_name,
        'serviceName', service_name,
        'startsAt', new.starts_at,
        'reference', new.reference
      ));
    elsif recipient_email is not null and new.status is distinct from old.status and new.status = 'Cancelled' then
      insert into booking_notification_outbox(business_id, appointment_id, event_type, recipient, payload)
      values (new.business_id, new.id, 'booking_cancelled', recipient_email, jsonb_build_object(
        'businessName', provider_name,
        'serviceName', service_name,
        'startsAt', new.starts_at,
        'reference', new.reference
      ));
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists booking_notification_outbox_trigger on booking_appointments;
create trigger booking_notification_outbox_trigger
after insert or update of status, starts_at on booking_appointments
for each row execute function booking_queue_notification();
