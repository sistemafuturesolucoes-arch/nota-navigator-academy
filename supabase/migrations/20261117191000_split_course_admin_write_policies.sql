drop policy if exists "Admins manage modules" on public.course_modules;
drop policy if exists "Admins manage lessons" on public.course_lessons;

create policy "Admins insert modules"
on public.course_modules for insert to authenticated
with check (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin');
create policy "Admins update modules"
on public.course_modules for update to authenticated
using (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin')
with check (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin');
create policy "Admins delete modules"
on public.course_modules for delete to authenticated
using (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin');

create policy "Admins insert lessons"
on public.course_lessons for insert to authenticated
with check (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin');
create policy "Admins update lessons"
on public.course_lessons for update to authenticated
using (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin')
with check (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin');
create policy "Admins delete lessons"
on public.course_lessons for delete to authenticated
using (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin');
