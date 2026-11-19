-- =====================================================================
--  pdf-audio : schéma Supabase
--  À coller dans Supabase > SQL Editor > New query, puis « Run ».
--  Le script peut être relancé sans danger.
-- =====================================================================

-- 1) Événements d'activité -------------------------------------------
--    Écrits et lus UNIQUEMENT par le backend (clé « service »).
--    Row Level Security activé sans aucune règle : le navigateur n'y a pas accès.
create table if not exists public.events (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  type       text not null,
  user_id    uuid,
  anon_id    text,
  session_id text,
  country    text,
  device     text,
  browser    text,
  props      jsonb not null default '{}'::jsonb
);
create index if not exists events_created_idx on public.events (created_at desc);
create index if not exists events_type_idx    on public.events (type, created_at desc);
alter table public.events enable row level security;

-- 2) Bibliothèque personnelle ----------------------------------------
create table if not exists public.library (
  user_id      uuid not null references auth.users (id) on delete cascade,
  fingerprint  text not null,
  filename     text not null,
  page_count   int  not null,
  size_bytes   bigint not null default 0,
  lang         text,
  last_page    int  not null default 1,
  storage_path text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, fingerprint)
);
alter table public.library enable row level security;

drop policy if exists "library_select" on public.library;
drop policy if exists "library_insert" on public.library;
drop policy if exists "library_update" on public.library;
drop policy if exists "library_delete" on public.library;
create policy "library_select" on public.library for select to authenticated using (auth.uid() = user_id);
create policy "library_insert" on public.library for insert to authenticated with check (auth.uid() = user_id);
create policy "library_update" on public.library for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "library_delete" on public.library for delete to authenticated using (auth.uid() = user_id);

-- 3) Stockage privé des PDF (25 Mo max par fichier) ---------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('pdfs', 'pdfs', false, 26214400)
on conflict (id) do nothing;

drop policy if exists "pdfs_own_files" on storage.objects;
create policy "pdfs_own_files" on storage.objects for all to authenticated
  using      (bucket_id = 'pdfs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'pdfs' and (storage.foldername(name))[1] = auth.uid()::text);

-- 4) (Facultatif) purge des événements de plus de 180 jours
-- delete from public.events where created_at < now() - interval '180 days';
