# Setting up Supabase (and email) for AURA

This guide is written for someone who has never used Supabase. It takes about
20 minutes. Without these steps the public site still works (the 11 sample
projects ship inside the app), but sign-in, customer projects, share links,
saved scenarios and enquiry storage are switched off and say so on screen.

## 1. Create the Supabase project

1. Go to <https://supabase.com>, sign up, and click **New project**.
2. Pick a name (e.g. `aura-production`), a strong database password (save it in
   your password manager) and the region closest to your customers.
3. Wait for the project to finish setting up (a minute or two).

## 2. Create the tables (run the migrations)

The database structure lives in `supabase/migrations/`. There are five files and
they must run **in name order**:

| File | What it does |
|---|---|
| `20261023000100_aura_core.sql` | Companies, members, projects, scenarios, share links, enquiries, renders, and the row-level security rules that keep each company's data private |
| `20261023000200_aura_storage.sql` | File buckets for project images, CAD models, saved renders and logos |
| `20261023000300_seed_sample_projects.sql` | The 11 public sample projects |
| `20261023000400_project_site.sql` | Saved surroundings (map data) per project |
| `20261023000500_api_functions.sql` | Small public functions the app calls (create company, open share link) |

**Easiest way (no tools to install):** in Supabase open **SQL Editor → New
query**, paste the whole contents of the first file, click **Run**, then repeat
for each file in order. Each should finish with "Success".

**With the command line** (if a developer is helping):

```bash
npx supabase@2.121.0 login
npx supabase@2.121.0 link --project-ref <your-project-ref>
npx supabase@2.121.0 db push
```

None of the migrations deletes or drops anything; they are safe to run on a new
project. Run each one only once.

## 3. Sign-in settings

In Supabase open **Authentication → URL Configuration**:

- **Site URL**: your live address, e.g. `https://aura.example.com`
- **Redirect URLs**: add `https://aura.example.com/**`
  (and `http://localhost:3000/**` if you also test on your own computer).

Sign-in is by emailed link only (no passwords). Supabase's built-in email
sender is heavily rate-limited (a few emails per hour) and is for testing.
For real customers, open **Authentication → Emails → SMTP Settings** and enter
an email provider (Resend works; see step 5 — Resend shows SMTP details on its
dashboard).

*Optional:* if customers often open the email on a different device from the
one they asked on, edit **Authentication → Emails → Magic Link** and change the
link to:

```
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/app
```

AURA accepts both the default link and this one.

## 4. Copy the keys into Vercel

In Supabase open **Project Settings → API** (or **API Keys**). In Vercel open
your project → **Settings → Environment Variables** and add:

| Name | Where to find it | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | "Project URL", e.g. `https://abcd.supabase.co` | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the `anon` / publishable key | No (safe in the browser; RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` / secret key | **Yes — never share it, never prefix it with `NEXT_PUBLIC_`** |
| `NEXT_PUBLIC_SITE_URL` | your live address, e.g. `https://aura.example.com` | No |

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` are accepted as
alternative names for the newer Supabase key format.

The service-role key is only used on the server, for two things: storing
enquiry/early-access form submissions from visitors who are not signed in, and
making short-lived (one-hour) download links for the images and CAD model of a
project **after** a share link has been checked as valid. Without it, share
pages still work but leave out uploaded images and models.

## 5. Enquiry and early-access emails (Resend)

1. Sign up at <https://resend.com>, add and verify your sending domain.
2. Create an API key.
3. Add to Vercel:

| Name | Example | Notes |
|---|---|---|
| `RESEND_API_KEY` | `re_…` | Secret |
| `AURA_ENQUIRY_TO` | `sales@yourcompany.com` | Where enquiries are sent |
| `AURA_ENQUIRY_FROM` | `AURA <hello@yourcompany.com>` | Must be on your verified domain. Defaults to Resend's test sender, which only delivers to your own Resend account address |

Every form submission is saved to the `enquiries` table **and** emailed when
both are configured. If only one is configured, the visitor is told the message
was received; if neither is, the form says honestly that it is not connected
and gives no false "sent" message. You can read stored enquiries in Supabase
under **Table Editor → enquiries**.

## 6. Optional settings

| Name | Default | What it does |
|---|---|---|
| `AURA_OVERPASS_URL` | `https://overpass-api.de/api/interpreter` | Map server used when an owner clicks "Load surroundings" |
| `AURA_GEOCODER_URL` | `https://nominatim.openstreetmap.org/search` | Address search. The public OpenStreetMap servers are free but rate-limited; use a paid provider for heavy use |
| `AURA_ALLOWED_ORIGINS` | (none) | Extra web addresses allowed to call AURA's APIs, comma-separated |
| `AURA_ASSISTANT_RATE_LIMIT` / `AURA_ENGINE_RATE_LIMIT` | 20 / 10 per 10 min | Request limits per visitor |

After adding or changing any variable, redeploy in Vercel (**Deployments → … →
Redeploy**) so the site picks it up.

## 7. Check it works

1. Open `https://<your site>/sign-in`, enter your email, click the link you receive.
2. Create your company, then a project.
3. In the project, open **Share**, create a link, and open it in a private
   browser window — you should see the project without signing in.
4. Click **Revoke** and reload the private window — it should say the link is
   not available.
5. Submit the form on `/developers` and check it arrives in your inbox and in
   the `enquiries` table.

## Running it all on your own computer

Developers can run Supabase locally with Docker:

```bash
npx supabase@2.121.0 start      # prints the local URL and keys
```

Put the printed `API URL`, `anon key` and `service_role key` in `.env.local`
using the names above. Sign-in emails then appear in the local test inbox at
<http://127.0.0.1:54324>. `supabase/config.toml` already allows
`http://127.0.0.1:3137` and `http://localhost:3000` as sign-in addresses.

The database security test runs against any Postgres:

```bash
AURA_TEST_PG="-h 127.0.0.1 -p 54322 -U postgres" npm test
```
