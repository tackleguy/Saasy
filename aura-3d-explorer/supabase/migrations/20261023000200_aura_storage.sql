-- Storage buckets for customer files. Every object path starts with the
-- owning organization's id: <org_id>/<project_id>/<file>. Members can only
-- read and write under their own organization's folder. Share pages and
-- exports read files server-side through short-lived signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('project-images', 'project-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('project-models', 'project-models', false, 52428800, array['model/gltf-binary', 'model/stl', 'application/sla', 'application/dxf', 'image/vnd.dxf', 'application/octet-stream']),
  ('project-renders', 'project-renders', false, 20971520, array['image/png']),
  -- Organization logos appear on public share pages and exports.
  ('org-logos', 'org-logos', true, 2097152, array['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "members read their organization's files" on storage.objects
  for select to authenticated
  using (bucket_id in ('project-images', 'project-models', 'project-renders', 'org-logos')
         and (storage.foldername(name))[1] = aura.current_org_id()::text);

create policy "members upload to their organization's folder" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('project-images', 'project-models', 'project-renders', 'org-logos')
              and (storage.foldername(name))[1] = aura.current_org_id()::text);

create policy "members replace their organization's files" on storage.objects
  for update to authenticated
  using ((storage.foldername(name))[1] = aura.current_org_id()::text)
  with check ((storage.foldername(name))[1] = aura.current_org_id()::text);

create policy "members delete their organization's files" on storage.objects
  for delete to authenticated
  using (bucket_id in ('project-images', 'project-models', 'project-renders', 'org-logos')
         and (storage.foldername(name))[1] = aura.current_org_id()::text);
