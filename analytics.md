# Analytics

Meshdiff runs a small, self-hosted, cookie-less pageview analytics pipeline
alongside Google Analytics. It tracks pageviews, unique visitors, countries,
languages, visited pages, and referrers, with a data footprint small enough
that 6 months of history is just as cheap to query as 1 month. This doc
covers the architecture, the data model, and how to set it up.

It runs **alongside GA for now, not as a replacement** — the two are meant
to be cross-checked before GA is ever removed. See `CLAUDE.md`'s CSP notes
for background on why GA itself has been unreliable here.

## Why this exists

- **No cookies, no persistent tracking.** A visitor is identified only by a
  hash of `IP + User-Agent + calendar day + a server-only secret`, rotated
  daily. Raw IPs are never stored.
- **First-party, not third-party.** The tracking beacon is same-origin
  (`/.netlify/functions/track`), so it isn't blocked by ad-blockers or
  privacy extensions the way `googletagmanager.com`/`google-analytics.com`
  requests routinely are.
- **Pre-aggregated, not raw event logs.** Every pageview beacon increments
  small daily counters directly — there's no table of one row per pageview
  to grow unbounded, and no nightly batch/rollup job is ever needed. A
  6-month query is just a `WHERE day BETWEEN ...` over an already-tiny
  table.
- **Real fix for a real GA problem.** GA silently dropped 100% of hits for
  a stretch here due to a missing `img-src` CSP entry (gtag.js beacons some
  hits as an `<img>` pixel, not fetch/XHR) — see `CLAUDE.md`. A first-party
  system removes that entire class of failure mode.

## Architecture

```
Browser (RootLayout.tsx, on mount + every route change)
  │  useTrackPageview() → trackPageview() [analytics.ts]
  │  navigator.sendBeacon POST { path, referrer, language }
  ▼
netlify/functions/track.mts  (Netlify Functions v2, same origin)
  │  derives: country (context.geo), visitor hash (context.ip + UA + day + salt),
  │           referrer → hostname only, path → query/hash stripped
  │  writes via 2 Postgres RPCs (atomic, upsert-increment):
  ▼
Supabase Postgres
  ├─ analytics_visitor_daily   (visitor_hash, day) — dedup only
  └─ analytics_daily_rollup    (day, dimension_type, dimension_value,
                                 pageview_count, visitor_count)
  ▲
  │  read via apps/api/src/lib/analyticsStats.ts
Fastify API — GET /admin/analytics?from=&to=
  ▲
  │  getAdminAnalytics() [adminApi.ts]
Browser — /admin/analytics (AdminAnalyticsPage.tsx)
```

### Data model

```sql
analytics_visitor_daily (
  visitor_hash text,
  day date,
  first_seen_at timestamptz,
  primary key (day, visitor_hash)
)
-- One row per unique visitor per day, not per pageview. Used solely to
-- answer "have I already counted this visitor today" (write side) and
-- "how many distinct people visited in this date range" (read side, via
-- count_distinct_visitors()).

analytics_daily_rollup (
  day date,
  dimension_type text check in ('page','country','language','referrer','total'),
  dimension_value text,
  pageview_count bigint,
  visitor_count bigint,
  primary key (day, dimension_type, dimension_value)
)
-- Up to 5 rows touched per pageview event (total + page + country +
-- language + referrer). pageview_count increments every time;
-- visitor_count increments only when the dedup table indicates a
-- new-today visitor.
```

Two Postgres RPC functions (both `security definer`, service-role-only,
same trust boundary as every other RPC in this project — see
`has_active_team_access()` in `teams.md`):

- `increment_analytics_rollup(day, dimension_type, dimension_value, is_new_visitor)`
  — atomic upsert-increment. Supabase-js's `.upsert()` can't express
  `SET count = count + 1` without a read-then-write race, hence the RPC.
- `count_distinct_visitors(from, to)` — `COUNT(DISTINCT visitor_hash)` over
  a date range. **This is the only correct way to get a true period-level
  unique-visitor count** — summing `analytics_daily_rollup`'s per-day
  `visitor_count` across a range double-counts a visitor active on
  multiple days. The rollup's `visitor_count` is only valid as a *daily*
  metric (used for the trend chart); the dashboard's period-total "Unique
  Visitors" stat card always goes through this RPC instead.

RLS is enabled on both tables with **no policies** — service-role only,
same lesson as the `blog_posts` RLS incident (see `CLAUDE.md`): never skip
this, even for a table nobody's supposed to query directly.

### Data footprint

- **Rollup table**: bounded by distinct `(day, dimension_type,
  dimension_value)` combinations, not by traffic volume — pre-aggregation
  is the entire point. Realistically a few thousand rows over 6 months for
  a small-to-medium site, well under 5 MB.
- **Dedup table**: grows with unique visitors × days — e.g. ~90K rows /
  ~8 MB over 6 months at 500 daily visitors. This is the one to watch if
  traffic grows a lot, but even at 5,000 daily visitors it's only tens of
  MB for 6 months.
- **No pruning is done yet, on purpose.** The dedup table needs to stay
  intact for the full window `count_distinct_visitors()` might be asked
  about — deleting old rows would break period-level unique counts for
  that range. If retention becomes a real concern later, the natural next
  step is a Supabase `pg_cron` job (not built — this repo has no scheduled-
  job infrastructure at all yet) or a manual admin-triggered cleanup
  endpoint, not something wired up preemptively.

## Where it lives in the app

- **`apps/web/src/lib/analytics.ts`** — `initAnalytics()` (existing GA
  setup, untouched) and `trackPageview()` (this feature) live side by
  side. Both are gated to `import.meta.env.PROD` — neither fires during
  `npm run dev`.
- **`apps/web/src/hooks/useTrackPageview.ts`** — mounted once in
  `RootLayout.tsx` (every route nests under it), fires on mount and on
  every `useLocation().pathname` change. This is a real improvement over
  the GA setup, which only ever tracks the very first document load —
  React Router navigation doesn't trigger a fresh page load for GA to
  hook into.
- **`netlify/functions/track.mts`** — the write endpoint. Fire-and-forget
  from the client via `navigator.sendBeacon` (falls back to
  `fetch(..., {keepalive:true})`); the client never inspects the response.
- **`apps/api/src/routes/analytics.ts`** + **`apps/api/src/lib/analyticsStats.ts`**
  — `GET /admin/analytics?from=&to=` (defaults to the last 30 days), gated
  identically to every other `/admin/*` route (`requireAuth` +
  `requireAdmin`, checked against `ADMIN_EMAILS`).
- **`/admin/analytics`** (`AdminAnalyticsPage.tsx`) — "Last 30 days" /
  "Last 6 months" toggle, stat cards (`AnalyticsStatsGrid.tsx`), a
  hand-rolled inline-SVG trend chart (`AnalyticsTrendChart.tsx`, same
  no-dependency approach as `SignupsChart.tsx` on the main Dashboard), and
  ranked breakdown lists for pages/countries/languages/referrers
  (`AnalyticsRankedList.tsx`). Linked from the sidebar's Admin section.
  - The trend chart shows each day's pageview count above its bar (plus a
    hover tooltip with the exact date), and overlays two lines splitting
    that same pageview total: **unique visitors** (blue) and **returning**
    (red). "Returning" here means repeat pageviews within the *same day*
    beyond each visitor's first hit — **not** a multi-day return. The
    visitor hash rotates every calendar day by design (see "Why this
    exists" above), so the system cannot recognize the same real person
    across two different days at all; there's no cross-day "new vs.
    returning" signal to show without weakening that privacy guarantee.
  - Top Countries/Languages render human-readable names (`"Germany"`,
    `"American English"`) via the browser's native `Intl.DisplayNames`
    (`apps/web/src/lib/localeNames.ts`) instead of raw codes — no static
    lookup table to maintain, falls back to the raw code for anything
    unrecognized. The raw code is still shown as a hover tooltip.
  - Every count — the Pageviews/Unique Visitors stat cards and each row in
    the four ranked lists — shows a green "+N" for today's (UTC) share of
    that number, when N > 0. Computed server-side per dimension value in
    `topBreakdown()`/`getAnalyticsSummary()`, not derived client-side.
  - Each ranked list paginates client-side, 15 entries per page, over the
    already-fetched array — `TOP_N` in `analyticsStats.ts` returns up to 50
    entries per dimension so there's enough to paginate through rather than
    silently truncating at 10. No extra request and no page reload on
    Prev/Next; the page resets to 1 whenever the 30-day/6-month toggle
    swaps in new data.

## Setup

### 1. Apply the migration

```bash
npx supabase db push --local        # local dev
```

For a hosted Supabase project, push via your normal migration deploy flow
(`supabase/migrations/20260101000024_analytics.sql`, mirrored at
`apps/api/migrations/0024_analytics.sql`).

### 2. Environment variables (Netlify only — not `apps/api/.env`)

The write path is a Netlify Function, not the Fastify API, so its env vars
live in **Netlify's site environment variables**, not `apps/api/.env`:

| Variable | Notes |
|---|---|
| `SUPABASE_URL` | Almost certainly already set — the share-link feature (`netlify/functions/share-create.mts`) depends on it |
| `SUPABASE_SERVICE_ROLE_KEY` | Same — already required by `share-create.mts`/`share-get.mts` |
| `ANALYTICS_HASH_SALT` | **New for this feature.** Any long random string, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Never committed. |

**If `/.netlify/functions/track` returns a 500** with `"Analytics is not
configured"`, one of these three is missing — check `ANALYTICS_HASH_SALT`
first, since the other two are shared with a feature that's presumably
already working.

### 3. Local testing

Netlify Dev (`netlify dev`) is needed to run the function locally — a
plain `npm run dev`/Vite session serves the frontend only, no functions.
`context.geo`/`context.ip` (Netlify Functions v2) can't be realistically
simulated by Netlify Dev — country derivation gracefully defaults to
`"unknown"` when absent, so real geo values can only be verified against
an actual Netlify deploy preview or production.

To verify the write/read path without `netlify dev`, call the two RPCs
directly against local Supabase (e.g. via `supabase db query --local -f
some.sql`) to seed rows, then either query
`analytics_daily_rollup`/`analytics_visitor_daily` directly in Supabase
Studio, or call `getAnalyticsSummary()` from `apps/api/src/lib/analyticsStats.ts`
in a throwaway `tsx` script to confirm the read path aggregates correctly.

### 4. Confirm it's live

Once deployed with the env vars set:
1. Open the site, open DevTools → Network, filter for `track`.
2. Confirm a `POST /.netlify/functions/track` fires on load and returns
   `200` (not `500`).
3. Sign in as an admin (`ADMIN_EMAILS`) and open `/admin/analytics` —
   pageviews/visitors should appear within the selected range shortly
   after real traffic starts landing.

## Explicitly not built (yet)

- Removing GA / its CSP entries — deliberate, not an oversight; the two
  systems are meant to run in parallel for a transition period first.
- Any retention/pruning job for `analytics_visitor_daily`.
- Bot/crawler filtering — every request that reaches the beacon is
  counted; there's no user-agent-based bot exclusion list.
- A "last N months" query for anything other than the 30-day/6-month
  presets already in the UI — the API itself takes arbitrary `from`/`to`,
  so this is a UI-only limitation, not a data-model one.
