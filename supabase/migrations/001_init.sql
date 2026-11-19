-- Dietzy database setup.
-- How to run: Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
-- Safe to run more than once.

-- 1) Each user's saved data. The app stores a handful of JSON "documents" per user:
--    coll 'main'   : 'profile', 'chat', 'm-YYYY-MM' (one per month of logs)
--    coll 'photos' : one row per progress photo (compressed image data)
create table if not exists public.user_docs (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  coll       text        not null default 'main',
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, coll, id)
);

-- 2) AI usage per user per day, so the server can apply daily limits.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null default current_date,
  calls   int  not null default 0,
  photos  int  not null default 0,
  primary key (user_id, day)
);

-- 3) Consent records (Terms, Privacy Policy, health-data consent) — kept for compliance.
create table if not exists public.consents (
  id          bigint generated always as identity primary key,
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text        not null,          -- 'terms', 'privacy', 'health_data', 'age_18'
  version     text        not null,          -- e.g. '2026-11-18'
  accepted_at timestamptz not null default now()
);
create index if not exists consents_user_idx on public.consents (user_id);

-- Row-level security: every signed-in user can only see and change their own rows.
alter table public.user_docs enable row level security;
alter table public.ai_usage  enable row level security;
alter table public.consents  enable row level security;

drop policy if exists "own docs: read"   on public.user_docs;
drop policy if exists "own docs: insert" on public.user_docs;
drop policy if exists "own docs: update" on public.user_docs;
drop policy if exists "own docs: delete" on public.user_docs;
create policy "own docs: read"   on public.user_docs for select to authenticated using (user_id = auth.uid());
create policy "own docs: insert" on public.user_docs for insert to authenticated with check (user_id = auth.uid());
create policy "own docs: update" on public.user_docs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own docs: delete" on public.user_docs for delete to authenticated using (user_id = auth.uid());

-- Users may read their own usage; only the server (service role) writes it.
drop policy if exists "own usage: read" on public.ai_usage;
create policy "own usage: read" on public.ai_usage for select to authenticated using (user_id = auth.uid());

-- Users may read and add their own consents, never edit or delete them.
drop policy if exists "own consents: read"   on public.consents;
drop policy if exists "own consents: insert" on public.consents;
create policy "own consents: read"   on public.consents for select to authenticated using (user_id = auth.uid());
create policy "own consents: insert" on public.consents for insert to authenticated with check (user_id = auth.uid());

-- Keep updated_at current.
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists user_docs_touch on public.user_docs;
create trigger user_docs_touch before update on public.user_docs for each row execute function public.touch_updated_at();

-- Server-side counter used by the AI function (runs with the caller's id; returns today's totals).
create or replace function public.bump_ai_usage(p_user uuid, p_photo boolean)
returns table (calls int, photos int)
language sql security definer set search_path = public as $$
  insert into public.ai_usage as u (user_id, day, calls, photos)
  values (p_user, current_date, 1, case when p_photo then 1 else 0 end)
  on conflict (user_id, day) do update
    set calls = u.calls + 1, photos = u.photos + case when p_photo then 1 else 0 end
  returning u.calls, u.photos;
$$;
revoke all on function public.bump_ai_usage(uuid, boolean) from public, anon, authenticated;
grant execute on function public.bump_ai_usage(uuid, boolean) to service_role;
