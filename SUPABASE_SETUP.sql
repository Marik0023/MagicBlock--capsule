-- MagicBlock Time Capsule public feed setup
-- Run this in Supabase SQL Editor

create extension if not exists pgcrypto;

-- Ensure defaults / constraints on the public feed table
alter table if exists public.capsule_feed
  alter column id set default gen_random_uuid();

alter table if exists public.capsule_feed
  alter column created_at set default now();

alter table if exists public.capsule_feed
  alter column sealed_at set default now();

-- Optional but recommended: make key fields required
-- Comment out any line if your current table intentionally allows nulls.
alter table if exists public.capsule_feed
  alter column nickname set not null,
  alter column avatar_url set not null,
  alter column box_thumb_url set not null,
  alter column message_length set not null;

create index if not exists capsule_feed_sealed_at_idx
  on public.capsule_feed (sealed_at desc);

-- Enable RLS and public read / anon insert for metadata only
alter table public.capsule_feed enable row level security;

-- Recreate policies safely
 drop policy if exists "Public can read capsule feed" on public.capsule_feed;
 drop policy if exists "Anon can insert capsule feed" on public.capsule_feed;

create policy "Public can read capsule feed"
on public.capsule_feed
for select
to anon, authenticated
using (true);

create policy "Anon can insert capsule feed"
on public.capsule_feed
for insert
to anon, authenticated
with check (
  char_length(trim(coalesce(nickname, ''))) between 1 and 24
  and char_length(coalesce(avatar_url, '')) > 0
  and char_length(coalesce(box_thumb_url, '')) > 0
  and coalesce(message_length, 0) between 10 and 300
);

-- Storage policies for capsule-public bucket (avatars + box thumbnails)
-- Bucket should exist and be PUBLIC: capsule-public

-- storage.objects RLS is usually enabled by default, but safe to call if needed on your project version.
-- alter table storage.objects enable row level security;

 drop policy if exists "Public read capsule assets" on storage.objects;
 drop policy if exists "Anon upload capsule assets" on storage.objects;

create policy "Public read capsule assets"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'capsule-public');

create policy "Anon upload capsule assets"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'capsule-public'
  and (storage.foldername(name))[1] in ('avatars', 'boxes')
);
