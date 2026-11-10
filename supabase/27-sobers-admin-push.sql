-- Phone push registrations for Sobers admin order alerts.
-- Run this in the Supabase SQL editor before enabling the order webhook.

create table if not exists public.admin_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  alerts_enabled boolean not null default true,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, endpoint)
);

create index if not exists admin_push_subscriptions_business_idx
  on public.admin_push_subscriptions (business_id);

alter table public.admin_push_subscriptions enable row level security;

drop policy if exists "admins manage own push subscriptions" on public.admin_push_subscriptions;
create policy "admins manage own push subscriptions"
  on public.admin_push_subscriptions
  for all
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

grant select, insert, update, delete on public.admin_push_subscriptions to authenticated;
