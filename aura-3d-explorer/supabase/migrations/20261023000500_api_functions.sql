-- Supabase's API (PostgREST) exposes functions in the `public` schema only.
-- These wrappers are what the app calls; the privileged logic stays in `aura`.

create function public.create_organization(org_name text, org_slug text) returns uuid
language sql volatile security invoker as $$ select aura.create_organization(org_name, org_slug) $$;

create function public.resolve_share(token text, password text default null)
returns table (project_id uuid, project jsonb, share_financials boolean, org_name text, org_slug text, org_logo text, org_accent text, needs_password boolean, site_snapshot jsonb, model_path text)
language sql stable security invoker as $$ select * from aura.resolve_share(token, password) $$;

create function public.hash_share_password(password text) returns text
language sql volatile security invoker as $$ select aura.hash_share_password(password) $$;

revoke all on function public.create_organization(text, text), public.resolve_share(text, text), public.hash_share_password(text) from public;
grant execute on function public.create_organization(text, text), public.hash_share_password(text) to authenticated;
grant execute on function public.resolve_share(text, text) to anon, authenticated;
