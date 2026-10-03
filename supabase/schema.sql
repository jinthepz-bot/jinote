-- Jinote cloud sync. Paste into Supabase → SQL Editor → Run. Safe to run again.
--
-- One table holds everything: each goal, logged set, task, to-buy item, event, note,
-- folder, Daily journal day, chat message and settings group is one row, keyed by
-- (user, collection, item id). The app stays offline-first; this is where devices
-- meet.
--
-- Security: Row Level Security is on and every policy is "your own rows only", for
-- signed-in users. The anon role has no access at all. The app only ever holds the
-- publishable key; nothing here needs the secret key.

create table if not exists public.sync_items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  collection text not null check (
    collection in ('goals', 'entries', 'tasks', 'toBuy', 'events', 'notes', 'folders', 'daily', 'chat', 'settings')
  ),
  item_id text not null check (length(item_id) between 1 and 200),
  -- The item as the app stores it; null once it's been deleted.
  data jsonb check (data is null or octet_length(data::text) <= 500000),
  deleted boolean not null default false,
  -- When the item was last changed on a device (ms since 1970). The newest edit wins.
  edited_at bigint not null,
  -- When this row last changed here. Devices download rows changed since they last looked.
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, collection, item_id)
);

create index if not exists sync_items_user_updated on public.sync_items (user_id, updated_at);

-- updated_at always moves on a write, however the row was written.
create or replace function public.sync_items_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists sync_items_touch on public.sync_items;
create trigger sync_items_touch
  before insert or update on public.sync_items
  for each row execute function public.sync_items_touch();

-- Row Level Security: signed-in users see and change their own rows, nobody else's.
alter table public.sync_items enable row level security;

drop policy if exists "Read own items" on public.sync_items;
create policy "Read own items" on public.sync_items
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Add own items" on public.sync_items;
create policy "Add own items" on public.sync_items
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Change own items" on public.sync_items;
create policy "Change own items" on public.sync_items
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Remove own items" on public.sync_items;
create policy "Remove own items" on public.sync_items
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.sync_items from anon;
grant select, insert, update, delete on public.sync_items to authenticated;

-- Upload a batch of changed items. A row is only replaced by a newer edit, so a
-- device that was offline for a while can't overwrite something changed since.
-- Runs as the caller (security invoker), so the policies above still apply.
create or replace function public.push_items(items jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.sync_items as s (user_id, collection, item_id, data, deleted, edited_at)
  select auth.uid(), i.collection, i.item_id, i.data, coalesce(i.deleted, false), i.edited_at
  from jsonb_to_recordset(items) as i (collection text, item_id text, data jsonb, deleted boolean, edited_at bigint)
  on conflict (user_id, collection, item_id) do update
    set data = excluded.data,
        deleted = excluded.deleted,
        edited_at = excluded.edited_at
    where s.edited_at < excluded.edited_at;
$$;

-- The coach chat keeps only its newest `keep` messages in the cloud. Older ones stay
-- on any device that already has them. Deleted markers are kept, so a cleared chat
-- still clears on the other device.
create or replace function public.prune_chat(keep integer default 200)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.sync_items s
  where s.user_id = auth.uid()
    and s.collection = 'chat'
    and not s.deleted
    and s.item_id not in (
      select c.item_id
      from public.sync_items c
      where c.user_id = auth.uid() and c.collection = 'chat' and not c.deleted
      order by (c.data ->> 'createdAt')::bigint desc nulls last
      limit keep
    );
$$;

revoke all on function public.push_items(jsonb) from public, anon;
revoke all on function public.prune_chat(integer) from public, anon;
grant execute on function public.push_items(jsonb) to authenticated;
grant execute on function public.prune_chat(integer) to authenticated;

-- ---------------------------------------------------------------------------------
-- Recipe photos: a private Storage bucket. Each photo is <user id>/<photo id>.jpg,
-- shrunk to about 200 KB by the app before upload. Signed-in users can only read,
-- add, replace and remove files in their own folder.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('note-photos', 'note-photos', false, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Read own photos" on storage.objects;
create policy "Read own photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'note-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Add own photos" on storage.objects;
create policy "Add own photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'note-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Replace own photos" on storage.objects;
create policy "Replace own photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'note-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'note-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Remove own photos" on storage.objects;
create policy "Remove own photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'note-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
