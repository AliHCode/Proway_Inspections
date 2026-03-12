-- Push subscriptions for Web Push / PWA notifications
create extension if not exists pgcrypto;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_install_id text,
  endpoint text not null unique,
  p256dh text,
  auth text,
  subscription jsonb not null,
  device_label text,
  user_agent text,
  is_active boolean not null default true,
  last_seen_at timestamp with time zone not null default timezone('utc'::text, now()),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.push_subscriptions
  add column if not exists device_install_id text;

update public.push_subscriptions
set device_install_id = md5(
  user_id::text || '|' || coalesce(device_label, '') || '|' || coalesce(user_agent, '')
)
where device_install_id is null or device_install_id = endpoint;

alter table public.push_subscriptions
  alter column device_install_id set not null;

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, device_install_id
      order by updated_at desc, created_at desc, id desc
    ) as rn
  from public.push_subscriptions
)
delete from public.push_subscriptions p
using ranked r
where p.id = r.id
  and r.rn > 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'push_subscriptions_user_device_install_key'
  ) then
    alter table public.push_subscriptions
      add constraint push_subscriptions_user_device_install_key unique (user_id, device_install_id);
  end if;
end $$;

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

create index if not exists push_subscriptions_active_idx
  on public.push_subscriptions (user_id, is_active);

create or replace function public.set_push_subscription_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  new.last_seen_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists trg_push_subscriptions_updated_at on public.push_subscriptions;
create trigger trg_push_subscriptions_updated_at
before update on public.push_subscriptions
for each row
execute function public.set_push_subscription_updated_at();

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can view own push subscriptions" on public.push_subscriptions;
create policy "Users can view own push subscriptions"
on public.push_subscriptions
for select
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "Users can insert own push subscriptions" on public.push_subscriptions;
create policy "Users can insert own push subscriptions"
on public.push_subscriptions
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own push subscriptions" on public.push_subscriptions;
create policy "Users can update own push subscriptions"
on public.push_subscriptions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own push subscriptions" on public.push_subscriptions;
create policy "Users can delete own push subscriptions"
on public.push_subscriptions
for delete
using (auth.uid() = user_id);
