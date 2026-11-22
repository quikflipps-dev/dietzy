-- Accountability buddies (Nov 22, 2026). Run once in Supabase → SQL Editor.
-- Each person who turns on sharing gets one "share card": a small summary (streak, days logged,
-- workouts, % to goal). Weight is never stored here. Buddies can read a card only by its random
-- invite code, through get_share_cards(); nobody can list all cards.

create table if not exists public.share_cards (
  code text primary key check (char_length(code) between 6 and 20),
  owner uuid not null unique references auth.users(id) on delete cascade,
  name text not null default '' check (char_length(name) <= 30),
  data jsonb not null default '{}'::jsonb,
  cheers jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.share_cards enable row level security;
grant select, insert, update, delete on public.share_cards to authenticated;

drop policy if exists "share_cards owner select" on public.share_cards;
drop policy if exists "share_cards owner insert" on public.share_cards;
drop policy if exists "share_cards owner update" on public.share_cards;
drop policy if exists "share_cards owner delete" on public.share_cards;
create policy "share_cards owner select" on public.share_cards for select using (auth.uid() = owner);
create policy "share_cards owner insert" on public.share_cards for insert with check (auth.uid() = owner);
create policy "share_cards owner update" on public.share_cards for update using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "share_cards owner delete" on public.share_cards for delete using (auth.uid() = owner);

-- Read buddies' cards by invite code (signed-in users only, at most 20 codes).
create or replace function public.get_share_cards(codes text[])
returns table (code text, name text, data jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.code, c.name, c.data, c.updated_at
  from public.share_cards c
  where auth.uid() is not null and c.code = any (codes[1:20]);
$$;

-- Send a cheer to a buddy's card (keeps the latest 20).
create or replace function public.send_cheer(target text, emoji text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if emoji not in ('👏', '🔥', '💪', '❤️', '🎉') then raise exception 'unsupported cheer'; end if;
  select coalesce(nullif(name, ''), 'A buddy') into me from public.share_cards where owner = auth.uid();
  update public.share_cards
     set cheers = (
       select coalesce(jsonb_agg(x), '[]'::jsonb) from (
         select x from jsonb_array_elements(
           jsonb_build_array(jsonb_build_object('e', emoji, 'from', coalesce(me, 'A buddy'), 'at', now())) || cheers
         ) as x limit 20
       ) s
     )
   where code = target and owner <> auth.uid();
end;
$$;

revoke all on function public.get_share_cards(text[]) from public, anon;
revoke all on function public.send_cheer(text, text) from public, anon;
grant execute on function public.get_share_cards(text[]) to authenticated;
grant execute on function public.send_cheer(text, text) to authenticated;
