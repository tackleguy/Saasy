-- A customer project's real surroundings: the OpenStreetMap snapshot fetched
-- once for its address (on the owner's explicit request) and kept with the
-- project, so share links and exports show the same city without new lookups.
alter table public.projects add column site_snapshot jsonb check (site_snapshot is null or jsonb_typeof(site_snapshot) = 'object');
alter table public.projects add column site_snapshot_at timestamptz;

-- Share links also carry the saved surroundings and the stored model path, so
-- a buyer sees the same city and building as the owner.
drop function aura.resolve_share(text, text);
create function aura.resolve_share(token text, password text default null)
returns table (project_id uuid, project jsonb, share_financials boolean, org_name text, org_slug text, org_logo text, org_accent text, needs_password boolean, site_snapshot jsonb, model_path text)
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare link public.share_links;
begin
  if token is null or token !~ '^[A-Za-z0-9_-]{43}$' then return; end if;
  select * into link from public.share_links
   where token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
     and revoked_at is null and (expires_at is null or expires_at > now());
  if not found then return; end if;
  if link.password_hash is not null and (password is null or extensions.crypt(password, link.password_hash) <> link.password_hash) then
    return query select null::uuid, null::jsonb, false, null::text, null::text, null::text, null::text, true, null::jsonb, null::text;
    return;
  end if;
  return query
    select p.id,
           case when link.share_financials then p.data else p.data - 'finance' end,
           link.share_financials, o.name, o.slug, o.logo_path, o.accent_color, false, p.site_snapshot, p.model_path
      from public.projects p join public.organizations o on o.id = p.org_id
     where p.id = link.project_id;
end $$;
revoke all on function aura.resolve_share(text, text) from public;
grant execute on function aura.resolve_share(text, text) to anon, authenticated, service_role;
