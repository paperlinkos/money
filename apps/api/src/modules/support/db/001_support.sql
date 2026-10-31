create table if not exists support_messages (
  id uuid primary key,
  kind text not null check (kind in ('question', 'problem', 'feature', 'pricing', 'password')),
  message text not null,
  contact text not null default '',
  would_pay text not null default '',
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists support_messages_open on support_messages(created_at desc) where done_at is null;

create table if not exists password_resets (
  token_hash text primary key,
  user_id uuid not null references platform_users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists password_resets_user on password_resets(user_id);
