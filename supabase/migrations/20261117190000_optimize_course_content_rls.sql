drop policy if exists "Admins manage modules" on public.course_modules;
drop policy if exists "Published modules are readable" on public.course_modules;
drop policy if exists "Admins manage lessons" on public.course_lessons;
drop policy if exists "Published lessons are readable" on public.course_lessons;

create policy "Admins manage modules"
on public.course_modules
for all to authenticated
using (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin')
with check (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin');

create policy "Published modules are readable"
on public.course_modules
for select to anon, authenticated
using (is_published or coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin');

create policy "Admins manage lessons"
on public.course_lessons
for all to authenticated
using (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin')
with check (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin');

create policy "Published lessons are readable"
on public.course_lessons
for select to anon, authenticated
using (
  (is_published and exists (
    select 1 from public.course_modules m
    where m.id = course_lessons.module_id and m.is_published
  ))
  or coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin'
);
