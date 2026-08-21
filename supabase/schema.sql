-- StrumLab cloud save. Run once in the Supabase SQL editor.
--
-- One row per player holding the whole app state as JSON. The state is small
-- (a handful of patterns and some audio settings) and is only ever read and
-- written as a unit, so columns per setting would buy nothing but migrations.

create table if not exists public.strum_state (
  user_id    uuid primary key references auth.users on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.strum_state enable row level security;

-- Each row is private to its owner.
drop policy if exists "own state" on public.strum_state;
create policy "own state" on public.strum_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
