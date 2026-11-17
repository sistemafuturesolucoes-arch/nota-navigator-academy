create table if not exists public.course_modules (
  id text primary key,
  title text not null,
  description text not null default '',
  icon text not null default 'BookOpen',
  position integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.course_lessons (
  id text primary key,
  module_id text not null references public.course_modules(id) on delete cascade,
  title text not null,
  summary text not null default '',
  path text,
  image_url text,
  video_path text,
  content text not null default '',
  hotspots jsonb not null default '[]'::jsonb,
  position integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_lessons_hotspots_array check (jsonb_typeof(hotspots) = 'array')
);

create index if not exists course_modules_position_idx on public.course_modules(position);
create index if not exists course_lessons_module_position_idx on public.course_lessons(module_id, position);

alter table public.course_modules enable row level security;
alter table public.course_lessons enable row level security;

drop policy if exists "Published modules are readable" on public.course_modules;
create policy "Published modules are readable"
on public.course_modules for select to anon, authenticated
using (is_published or coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin');

drop policy if exists "Published lessons are readable" on public.course_lessons;
create policy "Published lessons are readable"
on public.course_lessons for select to anon, authenticated
using (
  (is_published and exists (
    select 1 from public.course_modules m
    where m.id = course_lessons.module_id and m.is_published
  ))
  or coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin'
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-videos',
  'course-videos',
  false,
  2147483648,
  array['video/mp4','video/webm','video/quicktime','video/x-matroska']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins upload course videos" on storage.objects;
create policy "Admins upload course videos"
on storage.objects for insert to authenticated
with check (bucket_id = 'course-videos' and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin');

drop policy if exists "Admins read course videos" on storage.objects;
create policy "Admins read course videos"
on storage.objects for select to authenticated
using (bucket_id = 'course-videos' and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin');

drop policy if exists "Admins update course videos" on storage.objects;
create policy "Admins update course videos"
on storage.objects for update to authenticated
using (bucket_id = 'course-videos' and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin')
with check (bucket_id = 'course-videos' and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin');

drop policy if exists "Admins delete course videos" on storage.objects;
create policy "Admins delete course videos"
on storage.objects for delete to authenticated
using (bucket_id = 'course-videos' and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin');
