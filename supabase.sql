-- ქვის მეხსიერება — Supabase schema
-- Run once in Supabase: SQL Editor → New query → paste → Run.

create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  monument_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, monument_id)
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) <= 40),
  monument_id text not null,
  rating int not null check (rating between 1 and 5),
  text text not null check (char_length(text) between 3 and 600),
  created_at timestamptz not null default now()
);
create index if not exists reviews_monument_idx on public.reviews (monument_id, created_at desc);

create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  monument_ids text[] not null,
  created_at timestamptz not null default now()
);

alter table public.favorites enable row level security;
alter table public.reviews   enable row level security;
alter table public.routes    enable row level security;

-- favorites: only the owner
create policy "fav_select_own" on public.favorites for select using (auth.uid() = user_id);
create policy "fav_insert_own" on public.favorites for insert with check (auth.uid() = user_id);
create policy "fav_delete_own" on public.favorites for delete using (auth.uid() = user_id);

-- reviews: everyone can read, only the author writes/deletes
create policy "rev_select_all" on public.reviews for select using (true);
create policy "rev_insert_own" on public.reviews for insert with check (auth.uid() = user_id);
create policy "rev_delete_own" on public.reviews for delete using (auth.uid() = user_id);

-- routes: only the owner
create policy "route_select_own" on public.routes for select using (auth.uid() = user_id);
create policy "route_insert_own" on public.routes for insert with check (auth.uid() = user_id);
create policy "route_delete_own" on public.routes for delete using (auth.uid() = user_id);
