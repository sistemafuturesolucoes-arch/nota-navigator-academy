insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-images',
  'course-images',
  true,
  15728640,
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read course images" on storage.objects;
create policy "Public read course images"
on storage.objects for select to anon, authenticated
using (bucket_id = 'course-images');

drop policy if exists "Admins upload course images" on storage.objects;
create policy "Admins upload course images"
on storage.objects for insert to authenticated
with check (bucket_id = 'course-images' and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin');

drop policy if exists "Admins update course images" on storage.objects;
create policy "Admins update course images"
on storage.objects for update to authenticated
using (bucket_id = 'course-images' and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin')
with check (bucket_id = 'course-images' and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin');

drop policy if exists "Admins delete course images" on storage.objects;
create policy "Admins delete course images"
on storage.objects for delete to authenticated
using (bucket_id = 'course-images' and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') = 'admin');
