create table if not exists profiles (
  user_id text primary key,
  funding_cash double precision not null default 0,
  pairs jsonb not null default '[]',
  risk jsonb,
  updated_at timestamptz not null default now()
);
