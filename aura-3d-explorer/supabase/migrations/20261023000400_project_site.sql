-- A customer project's real surroundings: the OpenStreetMap snapshot fetched
-- once for its address (on the owner's explicit request) and kept with the
-- project, so share links and exports show the same city without new lookups.
alter table public.projects add column site_snapshot jsonb check (site_snapshot is null or jsonb_typeof(site_snapshot) = 'object');
alter table public.projects add column site_snapshot_at timestamptz;
