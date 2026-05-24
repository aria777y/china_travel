create extension if not exists pgcrypto;

create or replace function public.normalize_display_name(input text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(btrim(coalesce(input, '')), '\s+', ' ', 'g'));
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  display_name_key text generated always as (public.normalize_display_name(display_name)) stored,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(display_name_key)
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  day_id integer not null check (day_id between 1 and 365),
  route_title text not null,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  author_id uuid not null references public.profiles(user_id) on delete cascade,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('page', 'phase', 'day')),
  target_id text not null,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  author_id uuid not null references public.profiles(user_id) on delete cascade,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_day_id_created_at_idx on public.notes(day_id, created_at desc);
create index if not exists notes_author_id_idx on public.notes(author_id);
create index if not exists comments_target_created_at_idx on public.comments(target_type, target_id, created_at desc);
create index if not exists comments_author_id_idx on public.comments(author_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists notes_touch_updated_at on public.notes;
create trigger notes_touch_updated_at
before update on public.notes
for each row execute function public.touch_updated_at();

drop trigger if exists comments_touch_updated_at on public.comments;
create trigger comments_touch_updated_at
before update on public.comments
for each row execute function public.touch_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.has_profile()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
  );
$$;

alter table public.profiles enable row level security;
alter table public.notes enable row level security;
alter table public.comments enable row level security;

drop policy if exists "Public profiles are readable" on public.profiles;
create policy "Public profiles are readable"
on public.profiles
for select
using (true);

drop policy if exists "Users create own profile" on public.profiles;
create policy "Users create own profile"
on public.profiles
for insert
with check (auth.uid() = user_id and role = 'user');

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
on public.profiles
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and role = (
    select p.role
    from public.profiles p
    where p.user_id = auth.uid()
  )
);

drop policy if exists "Admins update profiles" on public.profiles;
create policy "Admins update profiles"
on public.profiles
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Public notes are readable" on public.notes;
create policy "Public notes are readable"
on public.notes
for select
using (is_hidden = false or author_id = auth.uid() or public.is_admin());

drop policy if exists "Profile users create notes" on public.notes;
create policy "Profile users create notes"
on public.notes
for insert
with check (
  auth.uid() = author_id
  and public.has_profile()
  and is_hidden = false
);

drop policy if exists "Authors update own notes" on public.notes;
create policy "Authors update own notes"
on public.notes
for update
using (auth.uid() = author_id)
with check (
  auth.uid() = author_id
  and is_hidden = false
);

drop policy if exists "Authors delete own notes" on public.notes;
create policy "Authors delete own notes"
on public.notes
for delete
using (auth.uid() = author_id);

drop policy if exists "Admins moderate notes" on public.notes;
create policy "Admins moderate notes"
on public.notes
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Public comments are readable" on public.comments;
create policy "Public comments are readable"
on public.comments
for select
using (is_hidden = false or author_id = auth.uid() or public.is_admin());

drop policy if exists "Profile users create comments" on public.comments;
create policy "Profile users create comments"
on public.comments
for insert
with check (
  auth.uid() = author_id
  and public.has_profile()
  and is_hidden = false
);

drop policy if exists "Authors update own comments" on public.comments;
create policy "Authors update own comments"
on public.comments
for update
using (auth.uid() = author_id)
with check (
  auth.uid() = author_id
  and is_hidden = false
);

drop policy if exists "Authors delete own comments" on public.comments;
create policy "Authors delete own comments"
on public.comments
for delete
using (auth.uid() = author_id);

drop policy if exists "Admins moderate comments" on public.comments;
create policy "Admins moderate comments"
on public.comments
for update
using (public.is_admin())
with check (public.is_admin());
