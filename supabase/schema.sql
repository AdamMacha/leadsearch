-- LeadRadar schema – spusť v Supabase: SQL Editor → New query → Run
create extension if not exists pgcrypto;

create table if not exists searches (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  location text not null default '',
  results_count int not null default 0,
  new_count int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  place_id text unique,
  source text not null default 'google_places',
  name text not null,
  address text,
  city text,
  phone text,
  email text,
  website text,
  google_maps_url text,
  category text,
  rating numeric,
  reviews_count int,
  business_status text,
  search_id uuid references searches(id) on delete set null,
  status text not null default 'new',
  notes text,
  need_score int,
  quality_score int,
  priority int,
  analysis jsonb,
  screenshot text,
  analyzed_at timestamptz,
  audit_slug text unique,
  audit jsonb,
  outreach jsonb,
  audit_views int not null default 0,
  audit_last_viewed_at timestamptz,
  next_action_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_priority_idx on leads (priority desc nulls last);
create index if not exists leads_status_idx on leads (status);
create index if not exists leads_search_idx on leads (search_id);

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  type text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists activities_lead_idx on activities (lead_id, created_at desc);

-- Přístup jen přes service role klíč ze serveru, veřejný (anon) přístup zakázán
alter table searches enable row level security;
alter table leads enable row level security;
alter table activities enable row level security;

-- Atomické navýšení počtu zobrazení auditu
create or replace function increment_audit_views(lead uuid)
returns void language sql as $$
  update leads set audit_views = audit_views + 1, audit_last_viewed_at = now() where id = lead;
$$;
