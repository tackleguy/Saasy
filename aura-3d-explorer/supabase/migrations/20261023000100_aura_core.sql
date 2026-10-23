-- AURA core schema: organizations, memberships, projects, scenarios,
-- share links and enquiries. Row-level security is enabled on every table.
--
-- Tenancy rule: a signed-in user belongs to exactly one organization
-- (memberships.user_id is unique). Every org-owned row carries org_id, and
-- every policy compares it with aura.current_org_id(), which reads the
-- caller's membership. No policy ever trusts an org_id sent by the client.
--
-- Public reads: sample projects (is_public) are readable by anyone. Share
-- links are resolved only through aura.resolve_share(), which checks the
-- token hash, expiry, revocation and optional password on every call.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists aura;
grant usage on schema aura to anon, authenticated, service_role;

-- --------------------------------------------------------------- tables

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$'),
  logo_path text,
  accent_color text check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);

create table public.memberships (
  user_id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now()
);
create index memberships_org_idx on public.memberships (org_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$'),
  name text not null check (char_length(name) between 1 and 160),
  status text not null default 'Concept' check (status in ('Concept', 'Approved', 'Under Construction', 'Selling')),
  city text not null default '',
  -- The full project document (same shape as src/content/projects.ts `Project`):
  -- copy, massing, finance defaults, hero images, palette, location.
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  -- Storage path of the customer's own model (GLB / STL / DXF) in the `models` bucket.
  model_path text,
  is_public boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Public samples have no organization; every customer project has one.
  constraint projects_owner check (is_public or org_id is not null)
);
create unique index projects_org_slug_idx on public.projects (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);
create index projects_org_idx on public.projects (org_id);

create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  -- { inputsById, layout } — validated by src/lib/scenarioStorage before use.
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_by uuid references auth.users (id) on delete set null,
  saved_at timestamptz not null default now()
);
create index scenarios_project_idx on public.scenarios (project_id, saved_at desc);

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- SHA-256 of the 32-byte random token. The token itself is shown once and never stored.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label text check (label is null or char_length(label) <= 80),
  expires_at timestamptz,
  password_hash text,
  share_financials boolean not null default false,
  revoked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index share_links_project_idx on public.share_links (project_id);

create table public.enquiries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete set null,
  org_id uuid references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('enquiry', 'demo')),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254 and email like '%_@_%'),
  company text check (company is null or char_length(company) <= 160),
  message text check (message is null or char_length(message) <= 4000),
  details jsonb not null default '{}'::jsonb,
  delivery text not null default 'stored' check (delivery in ('stored', 'emailed', 'email_failed')),
  created_at timestamptz not null default now()
);
create index enquiries_org_idx on public.enquiries (org_id, created_at desc);

-- Marketing stills captured from the live scene (Phase 3.3), stored in the `renders` bucket.
create table public.renders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  storage_path text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index renders_project_idx on public.renders (project_id, created_at desc);

-- -------------------------------------------------------------- helpers

-- The caller's organization, or null. SECURITY DEFINER so policies can read
-- memberships without recursive RLS; it only ever returns the caller's own row.
create function aura.current_org_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select org_id from public.memberships where user_id = auth.uid()
$$;

create function aura.is_org_owner() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.memberships where user_id = auth.uid() and role = 'owner')
$$;

create function aura.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger projects_touch before update on public.projects for each row execute function aura.touch_updated_at();

-- A child row (scenario, share link, render) must belong to the same org as its project.
create function aura.project_in_current_org(p uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.projects where id = p and org_id = aura.current_org_id())
$$;

-- First sign-in: create the caller's organization and owner membership in one step.
create function aura.create_organization(org_name text, org_slug text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if exists (select 1 from public.memberships where user_id = auth.uid()) then
    raise exception 'already a member of an organization' using errcode = '23505';
  end if;
  insert into public.organizations (name, slug) values (trim(org_name), lower(org_slug)) returning id into new_id;
  insert into public.memberships (user_id, org_id, role) values (auth.uid(), new_id, 'owner');
  return new_id;
end $$;

-- Resolve a share token for anyone (no sign-in). Returns nothing for an
-- unknown, revoked or expired token, or a wrong password. Revocation is
-- therefore effective on the very next request.
create function aura.resolve_share(token text, password text default null)
returns table (project_id uuid, project jsonb, share_financials boolean, org_name text, org_slug text, org_logo text, org_accent text, needs_password boolean)
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare link public.share_links;
begin
  if token is null or token !~ '^[A-Za-z0-9_-]{43}$' then return; end if;
  select * into link from public.share_links
   where token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
     and revoked_at is null and (expires_at is null or expires_at > now());
  if not found then return; end if;
  if link.password_hash is not null and (password is null or extensions.crypt(password, link.password_hash) <> link.password_hash) then
    return query select null::uuid, null::jsonb, false, null::text, null::text, null::text, null::text, true;
    return;
  end if;
  return query
    select p.id,
           case when link.share_financials then p.data else p.data - 'finance' end,
           link.share_financials, o.name, o.slug, o.logo_path, o.accent_color, false
      from public.projects p join public.organizations o on o.id = p.org_id
     where p.id = link.project_id;
end $$;

-- Hash a share password server-side (bcrypt via pgcrypto).
create function aura.hash_share_password(password text) returns text
language sql volatile security definer set search_path = extensions, pg_temp as $$
  select extensions.crypt(password, extensions.gen_salt('bf', 10))
$$;

-- ------------------------------------------------------------------ RLS

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.projects enable row level security;
alter table public.scenarios enable row level security;
alter table public.share_links enable row level security;
alter table public.enquiries enable row level security;
alter table public.renders enable row level security;

create policy "members read their organization" on public.organizations
  for select to authenticated using (id = aura.current_org_id());
create policy "owners update their organization" on public.organizations
  for update to authenticated using (id = aura.current_org_id() and aura.is_org_owner())
  with check (id = aura.current_org_id());

create policy "members see their organization's members" on public.memberships
  for select to authenticated using (org_id = aura.current_org_id());

create policy "anyone reads public sample projects" on public.projects
  for select to anon, authenticated using (is_public);
create policy "members read their projects" on public.projects
  for select to authenticated using (org_id = aura.current_org_id());
create policy "members create projects in their organization" on public.projects
  for insert to authenticated with check (org_id = aura.current_org_id() and not is_public and created_by = auth.uid());
create policy "members update their projects" on public.projects
  for update to authenticated using (org_id = aura.current_org_id()) with check (org_id = aura.current_org_id() and not is_public);
create policy "members delete their projects" on public.projects
  for delete to authenticated using (org_id = aura.current_org_id());

create policy "members manage scenarios" on public.scenarios
  for all to authenticated
  using (org_id = aura.current_org_id())
  with check (org_id = aura.current_org_id() and aura.project_in_current_org(project_id));

create policy "members manage share links" on public.share_links
  for all to authenticated
  using (org_id = aura.current_org_id())
  with check (org_id = aura.current_org_id() and aura.project_in_current_org(project_id));

-- Enquiries are written by the server (service role) only; members read their own.
create policy "members read their enquiries" on public.enquiries
  for select to authenticated using (org_id = aura.current_org_id());

create policy "members manage renders" on public.renders
  for all to authenticated
  using (org_id = aura.current_org_id())
  with check (org_id = aura.current_org_id() and aura.project_in_current_org(project_id));

-- ----------------------------------------------------------- privileges

revoke all on all tables in schema public from anon, authenticated;
grant select on public.projects to anon;
grant select, update on public.organizations to authenticated;
grant select on public.memberships to authenticated;
grant select, insert, update, delete on public.projects, public.scenarios, public.share_links, public.renders to authenticated;
grant select on public.enquiries to authenticated;
grant all on all tables in schema public to service_role;

revoke all on all functions in schema aura from public;
grant execute on function aura.current_org_id(), aura.is_org_owner(), aura.project_in_current_org(uuid) to authenticated;
grant execute on function aura.create_organization(text, text), aura.hash_share_password(text) to authenticated;
grant execute on function aura.resolve_share(text, text) to anon, authenticated;
grant execute on all functions in schema aura to service_role;
