# Kochi Transit — project context

Read this first. It carries decisions made before the repo existed, so don't
re-litigate them without a reason.

**Product statement:** "Know when to leave, not just where the train is."
The map is the interface. The decision engine is the product.

---

## Status

Phase 0 (feasibility) is **closed**. Every blocking question is answered, and
the feed itself has been downloaded and inspected (`KMRLOpenData/`, extracted
2026-09-22). Findings below are verified against primary sources.

| Question | Status |
|---|---|
| Is the data licensed for this? | **Yes — commercial use allowed** |
| Does KMRL publish realtime? | **No public GTFS-RT found** |
| Is the timetable exact or headway-based? | **Exact** — no `frequencies.txt`, all `timepoint=1` |
| What is the fare model? | **Complete 625-pair lookup table** (see finding 5) |
| Is the feed bilingual? | **Yes** — `translations.txt`, Malayalam + Hindi |
| Is the published feed still current? | **Timings yes — declared validity window lapsed** (finding 6) |

The last row is a metadata problem, not a data problem. KMRL has confirmed the
published timings are still accurate; only `feed_end_date` was never rolled
forward. Design around it, don't alarm users about it.

---

## Verified findings

### 1. Licensing is fine, with conditions

From KMRL's open-data terms (https://kochimetro.org/open-data/):

- Free, worldwide, non-exclusive license. **"The Data may be used for
  commercial and non-commercial applications."** A paid product is viable.
- **Required attribution, verbatim:** "Contains data provided by Kochi Metro
  Rail Limited". Put it in the UI (About page + map credit line).
- **Must not** imply KMRL endorses the app.
- Must not modify the data to make it inaccurate or misleading.
- Breach ends the license **automatically**. Governed by Indian law.
- KMRL may change or discontinue access **without notice**, and does not
  guarantee the data stays updated. Treat the feed as untrusted and expiring.

### 2. There is no public realtime feed

KMRL's open-data page describes **only** static GTFS — "information that does
not change frequently like routes, schedules, fare information". No GTFS-RT
endpoint is published.

**Confirmed a second way (2026-09-22):** KMRL's own site at
`corporate.kochimetro.org/stations/<slug>` shows next-train timings under a
header reading verbatim **"Next Trains (Live GTFS Schedule)"**. The page source
contains no API call, socket or vehicle data — grepping for
`fetch|api|realtime|vehicle|websocket` returns one `fetch` and one `GTFS`. The
operator's own site derives "live" from the static timetable, exactly as we
would. If KMRL had realtime, it would be here.

**Consequence:** the original plan's premise was wrong. Realtime cannot be the
differentiator. Build schedule-only and keep the realtime adapter replaceable.

Open action: email `opendata@kmrl.co.in` asking about GTFS-RT access. One reply
decides whether the realtime track ever opens.

Feed URL: `https://kochimetro.org/opendata/KMRLOpenData.zip`
(the `tinyurl.com/kmrlopendata` link on their page redirects there)

### 3. The competitor is schedule-based too

`kochimetro.keralam.co` bills itself as a "Live Map" but its own disclaimer
says **"Train locations are based on schedules and are not live."** It
interpolates positions from the timetable.

**Consequence:** matching it is a few days' work, so it isn't a moat. Our edge
is (a) leave-by intelligence and (b) being honest about what's scheduled vs
measured, which they are not.

### 4. The network is one line, 25 stations

Aluva to Thrippunithura. This invalidates several choices in the original spec.

Verified feed contents (`KMRLOpenData/`):

| File | Contents |
|---|---|
| `stops.txt` | 25 stations, with `wheelchair_boarding` |
| `trips.txt` | 450 trips — 255 WK, 195 WE; 2 shapes (`R1_0`, `R1_1`) |
| `stop_times.txt` | 10,726 rows, all 450 trips present, no orphans |
| `shapes.txt` | 1,018 points (469 + 549) with `shape_dist_traveled` |
| `translations.txt` | Malayalam + Hindi per stop name |
| `calendar.txt` | Only `WK` (Mon–Sat) and `WE` (Sun) |

Absent: `frequencies.txt`, `calendar_dates.txt`, `transfers.txt`.

Consequences: the timetable is **exact**, so the leave-by engine can name a
specific train. There are **no holiday exceptions** in the data — public
holidays will be wrong, and no feed fix is available. Service spans
**05:00:00 to 24:03:45** (last train reaches Muttom at 00:03:45), so the
24:00+ handling is load-bearing, not theoretical: trip `WK_253` is the one
that crosses.

The four pre-06:00 trips are **revenue service, not depot moves** — KMRL's own
station pages advertise a 5:03 AM first train at Kalamassery, which is `WK_4`
(departs Muttom 05:00) passing through. Anything that drops them is losing
trains passengers actually catch.

### 5. The fare model is a complete lookup table

`fare_attributes.txt` + `fare_rules.txt` give 6 flat bands — ₹10/20/30/40/50/60
(`F6`…`F1`) — across **625 rows = 25 × 25**. Verified: every ordered pair is
covered, zero missing, zero asymmetries (A→B always equals B→A), and all 25
self-pairs exist at ₹10 (KMRL's minimum).

So the fare engine is a build-time map (`{"ALVA|EDAP": 40}`, ~10 KB), not a
computation. Still block same-station journeys in the UI even though the
feed prices them.

**The real hazard is subtler than "don't use distance".** Distance is provably
unsafe — a distance model misprices 104 of 600 pairs. But the published table
is currently an *exact* function of station count (1 hop ₹10, 2-4 ₹20, 5-7 ₹30,
8-11 ₹40, 12-16 ₹50, 17-24 ₹60), verified: **0 mismatches across all 600
pairs**. So a hop-count formula is indistinguishable from the table today, and
no test comparing against the current feed can catch someone replacing the
lookup with arithmetic. The danger is not that the formula is inexact now — it
is that it is exact now and KMRL revises fares without revising `feed_version`.
Use the table. The only test that catches a formula swaps the table underneath
the lookup; `fares.spec.ts` does this.

Note: `transfers` in `fare_attributes.txt` is **empty**, which in GTFS means
*unlimited*, not `false`. Don't transcode it to `false`.

### 6. The feed's validity window lapsed, but the timings are still good

Downloaded from the official URL on 2026-09-22:

```
feed_start_date  20240812
feed_end_date    20251231      <- lapsed, never rolled forward
feed_version     1.0           <- never revised
```

KMRL has not republished since August 2024. **KMRL has confirmed the timings in
this file are still accurate** — only the declared validity window was left to
expire. (Confirmed in correspondence, September 2026. Keep the reply on file;
the assurance is dated, not permanent.)

**Independently corroborated:** KMRL's own station pages render from this same
data. Their Kalamassery page states "First Train 5:03 AM · Last Train 12:01 AM";
our feed gives first 05:03, last 24:01 at `KLMT`. Exact match. So the operator
is publicly serving these timings today — the strongest evidence available that
the file is current, short of a republish.

So this is a metadata defect, not a data defect. Two consequences, and they
pull in opposite directions:

**Do not alarm users.** A banner saying "this data may be wrong" would be
false. The honest line is narrower and dated:
*"Timings from KMRL's published schedule, confirmed current with KMRL in
September 2026."*

**Do keep the expiry detection anyway.** KMRL has demonstrated they change
timings without republishing, so the file will drift silently the moment they
do, and nothing in the data will signal it. The assurance has a shelf life.
Therefore:

- Store the confirmation date alongside `feed_version` / `feed_hash`.
- Re-confirm periodically (a diary reminder, not code).
- Keep the EXPIRED state implemented but reframe it: it fires on
  *confirmation staleness*, not on `feed_end_date`. Past ~6–12 months without
  re-confirmation, soften to "may have changed since".

**The compliance trap is unchanged:** `calendar.txt` gives both `WK` and `WE`
an `end_date` of `20251231`, so a spec-compliant consumer resolves zero active
services for any 2026 date and renders an empty timetable. Evaluate service by
day-of-week and treat the lapsed window as provenance metadata, never as a
filter.

### 7. Competitor teardown — kochimetro.keralam.co

Source studied at `../kochi-metro-timings-main/`. React 18 + Vite + Leaflet,
single page, no backend, GTFS transcoded to 1.6 MB of JSON in `public/data/`.
It uses the **same feed we do**, byte-equivalent in vintage.

Architecturally it validates our descoped plan: no Postgres, no PostGIS, no
Redis, no routing algorithm, no Nx — and their A→B logic is four lines
(`fromIndex`/`toIndex` into the trip's stop array, reject if
`fromIndex >= toIndex`). Direction falls out for free. Decision 1 confirmed.

Defects we can be measurably better than:

1. **Drops the first 4 trains of the day.** Their converter loses every trip
   departing before 06:00 — `WK_4` (05:00), `WK_256` (05:20), `WK_18` (05:45),
   `WK_12` (05:57) — while still listing them in `trips.json`, so their own
   data has dangling references. Their hardcoded "Operating Hours 6:00 AM –
   10:30 PM" matches their broken data, not the feed.
2. **The last train vanishes at midnight.** They compare `24:01:15` (86,475 s)
   against `getHours()*3600+…` (0–86,399), so `WK_253` can never match after
   00:00. Their day-of-week filter flips at midnight too.
3. **Markets "live," disclaims in the footer.** SEO title is "Kochi Metro
   Timings, Live Map…", `alternateName: "Kochi Metro Live"`; the "not live"
   note is small grey text under the map.
4. ~~No expiry warning.~~ **Retracted** — since KMRL confirms the timings are
   accurate (finding 6), showing them without an expiry warning is defensible.
   This is no longer a differentiator; don't build the pitch on it.
5. Also: error state fetched and discarded (fetch failure → permanently blank
   UI), no loading state for 1.6 MB, not actually a PWA (empty manifest name,
   no service worker), ~27k string parses/sec in a 1 s loop with no indexing,
   and Microsoft Clarity session recording.

### 8. KMRL's own site is the third competitor — and discarded its SEO

`corporate.kochimetro.org` (Next.js App Router) has all 25 station pages at
`/stations/<slug>`, server-rendered with real GTFS data. On domain authority it
beats everyone. But:

```
<title>Kochi Metro Rail Limited</title>
<meta name="description" content="Most Advanced Metro in India"/>
```

**That is the title and description on every station page — all 25 identical.**
Nothing identifies the station. `sitemap.xml` and `robots.txt` both 404. They
have no origin-destination pages; their route finder is a client-side widget.

So they hold the authority and have thrown away every on-page signal that would
let those pages rank for station queries.

Two defects of their own, sampled 2026-09-22 at 13:08 IST:

- **Next-train clock ~1 hour fast.** Page showed "1 min (2:11 PM)". Our feed
  queried at 14:10 returns 14:11 as the next `KLMT` departure, so their
  reference clock reads ~14:10. A stale cache would show times in the *past*,
  so this is a clock/timezone fault.
- **The "Following" column is wrong independently.** At their own 14:10 clock
  the feed's second departures are 14:20 / 14:19; they render 14:13 / 14:15,
  matching neither direction.

Their station "Connectivity" block is placeholder text — "Feeder Buses: Routes
available: Check station for latest routes" — identical across stations. There
is no feeder route data to reuse.

Note their station codes differ from GTFS (`ALV`/`PCD`/`CPD` vs
`ALVA`/`PNCU`/`CPPY`), so they maintain a separate internal dataset.

### 9. The 45-minute last-train cliff

Weekday headways at MG Road towards Aluva:

```
06:00   12-20 min      (sparse - "every 7 minutes" is false here)
08-09   7 min
12-16   8 min
21:00   9-15 min
22:00   6 min, then 45 min -> last train
```

The final train is preceded by a 45m56s gap — **towards Aluva only** — and
**the advertised last train is not the last train that gets you there.**

| From, towards Aluva | 2nd-last | Last departure | …but it terminates at | Last train **reaching Aluva** |
|---|---|---|---|---|
| Tripunithura | 22:36 | 23:22 | Muttom | **22:30** |
| Vyttila | 22:47 | 23:33 | Muttom | **22:40** |
| MG Road | 22:58 | 23:44 | Muttom | **22:52** |
| Edapally | 23:09 | 23:55 | Muttom | **23:03** |
| Kalamassery | — | 24:01 | Muttom | **23:10** |

**At all 20 cliff stations the final towards-Aluva departure terminates at
Muttom**, 51–53 minutes after the last through train. Read the MG Road row
again: the last train that actually reaches Aluva leaves at **22:52**, which is
*earlier than the 22:58 this table calls second-to-last*. A last-train feature
that advertises the 23:44 strands the passenger it exists to protect, at every
one of the 20 stations. This is the single most dangerous fact in the dataset.

So the UI must lead with **`lastThrough`** and demote the short-turn to a
secondary line ("a later train leaves at 11:44 PM, but it stops at Muttom").
The 45-minute gap is the *less* important of the two facts.

**Scope — and it is Monday–Saturday only.** Measured per service pattern over
boardable departures (a trip's final stop is an arrival, not something you can
board):

```
WK towards Aluva          20 of 24 platforms, gap 2756 s (45m56s)
                           4 do not: Pulinchodu, Companypady, Ambattukavu, Muttom (15-16 min)
                           Aluva has no towards-Aluva platform at all
WK towards Tripunithura    0 of 24 — max final gap 15 min
WE towards Aluva           0 of 24 — max final gap 22 min (Vadakkekotta)
WE towards Tripunithura    0 of 24 — max final gap 15 min
```

**There is no cliff on Sunday anywhere on the network.** Earlier revisions said
"every station", then "21 of 25", then "20 of 48 pairs" without naming a
service pattern. The correct statement is 20 of 24 *weekday towards-Aluva*
platforms.

An earlier revision claimed "45 minutes at every station", then "21 of 25 with
Aluva exempt". Both wrong: a terminus is not an exempt platform, it is not a
platform. Count boardable departures only — a trip's final stop is an arrival,
not something you can board. **Do not render a cliff warning towards
Tripunithura**; overstating uncertainty breaks the honesty rules exactly as
badly as understating it.

**The strand mirrors even though the gap does not, and it runs on Sunday too.**
At the four northern stations — Aluva, Pulinchodu, Companypady, Ambattukavu —
the final *southbound* departure also terminates at Muttom. This is not a
footnote: **Aluva → Edapally's last useful train is 22:30 while the platform's
last departure is 22:51**, a 21-minute strand on an ordinary journey out of a
terminus, affecting 20 origin-destination pairs.

**Corrected in Phase 6 — the Sunday half was understated.** An earlier revision
said only "the Sunday towards-Aluva final departure also short-turns at Muttom,
21 minutes after the last through train", which reads as one platform and one
number, and said nothing at all about Sunday southbound. Counted over the feed,
the strand exists in **all four** service-pattern/direction groups:

```
WK towards Aluva          20 of 24 platforms, strand 51-53 min
WK towards Tripunithura    4 of 24 platforms, strand 21 min      (the 4 northern)
WE towards Aluva          20 of 24 platforms, strand 20-22 min
WE towards Tripunithura    4 of 24 platforms, strand 20 min      (never stated before)
```

That is 48 of the 96 platform/pattern combinations, and the four that never
short-turn in a given direction are always the same four — Pulinchodu,
Companypady, Ambattukavu and Muttom towards Aluva. Asserted as censuses in
`schedule-view.spec.ts`.

So the *cliff* is weekday-and-southbound-only, but **`lastThrough` is needed in
both directions on both service patterns — always, not usually.** The two facts
have different scopes and conflating them is how this finding went wrong three
times; the fourth time was scoping the strand too narrowly rather than the gap
too widely.

**Product consequence:** both competitors answer *"when is the next train?"*
Nobody answers *"am I going to be OK?"* The second question is the product.

Also: `wheelchair_boarding` is `1` for all 25 stations, so it carries zero
signal. Do not build accessibility filtering on it (keralam.co displays
"Wheelchair Accessible", which is trivially true everywhere). Real
accessibility data has to be observed — see finding 10.

### 10. Short-turn trains are a passenger trap

**38 of 450 trips do not run the full line.** Muttom is the depot, so these
are run-ins and run-outs. The split matters more than the total:

| | Count | Where | Consequence |
|---|---|---|---|
| **Terminate early** | **20** | 18 Muttom, 2 Kadavanthra | **Must be labelled** — strands a passenger |
| Start late | 20 | 18 Muttom, 2 Kadavanthra | Harmless — simply absent from earlier stations |
| (in both groups) | 2 | | |

So **20 is the number that needs labelling in the UI**, and **38 is the number
that must survive any re-encoding of the feed**. An earlier revision of this
finding said 20 partial trips, having counted only terminations; both numbers
are now asserted in `test_network.py`.

Any "next trains from this station" board **must label the 20** — otherwise a
passenger bound for Aluva boards a train that stops at Muttom. keralam.co
avoids this by accident (its A→B filter only matches trips containing both
stops); a departure board has no such protection.

Direction mapping, verified from the data rather than assumed:
`direction_id=0` → increasing stop index → **towards Tripunithura**;
`direction_id=1` → decreasing → **towards Aluva**.

---

## MVP feature scope

Ordered by impact per unit of work. Items 1-4 are free from data in hand;
5-7 need one day of fieldwork and are the only ones a competitor cannot copy
from the same public feed.

1. **Zero-tap open.** Geolocate → nearest station → both directions with next
   two departures. No dropdowns. Both competitors make you select From and To
   on every visit; a daily commuter does that twice a day, 250 days a year.
   Station spacing is a median 1,051 m and a minimum of 465 m (Kaloor ↔ Town
   Hall) **measured straight-line between stop coordinates**, comfortably
   beyond GPS error, so this resolves reliably. It is a haversine loop over 25
   points. Note the bundle's `shapes.stop_dist` chainage gives different
   numbers for the same gaps — median 1,150 m, min 470 m, max 2,050 m — because
   it follows the track. Neither is wrong; say which you mean.
2. **Plain-language platform.** "Towards Tripunithura" is meaningless to
   someone who wants Kaloor. Show the served list, or the single line
   *"Platform towards Tripunithura"* once a destination is picked. Already
   emitted by `build_pages.py` as `platforms[].serves` in both languages.
3. **Last train home** (finding 9). From ~21:00 the app changes character:
   last train, time remaining, and the 45-minute gap before it.
4. **The run nudge.** Next ≤2 min and following ≥8 → *"Run - 2 min, then 9."*
   Show the gap, not just the time; the gap is what changes behaviour.
5. **Coach position.** Which coach puts you at the exit you want. Citymapper's
   signature feature and the most-loved small feature in transit apps.
6. **Which side the doors open.** Standard in Japanese and Singaporean apps,
   absent here.
7. **Exit → landmark.** "Exit B for Lulu Mall." The feed has no entrances at
   all, so the last 200 m is unserved by anyone.

8. **Book on WhatsApp.** Deep-link to KMRL's official booking chat from every
   route and station page. Already emitted as `booking_url`.
   **Use `wa.me/919188957488?text=Book%20Ticket`** — lifted verbatim from
   KMRL's own "Book a Ticket" button. Third-party articles give a different
   number (`90486 90486`) and a different syntax (`BOOK <route> <date>`);
   both are wrong. Do not prefill the journey until the bot's grammar has
   been tested in a real conversation — a message it cannot parse is worse
   than a generic one (`BOOKING_PREFILL_JOURNEY` in `build_pages.py`).
   Label it as KMRL's channel, not ours: the licence forbids implying
   endorsement. Do not repeat the unverified "10% WhatsApp discount" claim.

Templates for 5-7 are in `fieldwork/` (25-row station survey, 50-row platform
survey, plus collection notes). The same ride also closes leave-by gap 2 by
measuring real street-to-platform times per station.

**Do not build:** realtime, crowding or disruption alerts — the three other
features people ask for, and all three need data that does not exist for
Kochi. Accessibility filtering is also out, per finding 9.

---

## Decisions that override the original planning document

The original `kochi-transit-project-documentation.txt` was written assuming
realtime existed and the network was large. These supersede it:

1. **No routing algorithm.** Dijkstra/A*, transfers, and "fastest / cheapest /
   fewest transfers" are meaningless on a single line. Every A→B journey is:
   which direction, which departure, how long. Revisit when Line 2 or Water
   Metro lands — and then use OpenTripPlanner, not a custom graph.

2. **No PostGIS and no backend.** Not "probably" — Phase 0 closing removed the
   hedge. No realtime, no accounts, and the entire network compacts to
   **7.2 KB gzipped / 5.3 KB brotli** (450 trips, 10,726 stop times, both shapes, all 625 fare
   pairs, 25 stops). Nearest-of-25 is a haversine loop. Ship the lot to the
   browser, precache it in the service worker, and the app works fully
   offline — permanently, since there is no live data to degrade.

3. ~~Pick one deployment target.~~ **Resolved: Cloudflare Pages, static.**
   With no API, Fastify/Postgres/Redis and Workers/D1/KV all drop out and the
   contradiction in the original doc dissolves.

4. **Drop Redis/KV and SSE** until realtime exists.

5. **Drop Nx.** One app, nothing to share between libraries. Was "defer";
   now there is nothing it would buy.

6. **Realtime items move to a conditional track.** Remove "GTFS-RT connected"
   and train markers from the MVP acceptance criteria — they contradict the
   Phase 0 fallback.

7. **Bilingual (English + Malayalam) is MVP, not a setting.** Confirmed: the
   feed ships `translations.txt` with Malayalam *and* Hindi per stop name, so
   this is free — no manual sourcing needed.

8. **Don't call it SaaS** until there's a business model. It affects licensing
   choices (e.g. CARTO commercial terms) and infra commitment.
   If one is ever wanted, the honest shape is not subscriptions for a
   25-station app — it is that the engine generalises. Leave-by plus
   prerendered SEO pages from a GTFS feed fits any small operator, and most
   have KMRL's exact problem: a stale feed and an unusable website. Kochi is
   the proof, not the product.

---

## Current stack (replaces reference.txt §65)

Settled. Everything in reference.txt's "FINAL FROZEN MVP STACK" that is not
listed here has been dropped, and findings 2–6 say why.

| Layer | Choice |
|---|---|
| Framework | **Angular 21**, standalone + signals |
| Styling | Tailwind |
| Rendering | Angular SSR, **fully prerendered** (1,250 routes) |
| Offline | Angular service worker, whole dataset precached |
| Map | **Leaflet 1.9.4 + CARTO basemap**, lazy-loaded; SVG schematic as the offline fallback (see below) |
| Backend | none |
| Database / cache | none |
| Hosting | Cloudflare Pages, static |
| Build scripts | Python, stdlib only (`gtfs_inspect.py`, `build_pages.py`) |
| CI | GitHub Actions |
| Testing | Vitest, Angular TestBed, Playwright |

**Why Angular and not Next.** On merit it is close to a wash — bundles are
comparable, there is no SSR data fetching, and hosting is identical. Next's one
real edge is mass route prerendering, and Angular 19+ closed that with
`getPrerenderParams`. The tiebreaker is fluency: the framework you are fastest
in beats the marginally better one for a solo build, and the differentiator is
the leave-by engine, not the renderer.

**Prerendering, concretely** — feed the manifest straight in:

```ts
// app.routes.server.ts
import { RenderMode, ServerRoute } from '@angular/ssr';
import { readFileSync } from 'node:fs';

// NEVER `import` pages.json. It is 4MB and an import inlines it into the
// bundle — including the SSR bundle. readFileSync keeps it out of the module
// graph entirely. `app/scripts/check-bundle-size.mjs` enforces this and will
// fail the build if anything imports it or if it reaches browser output.
const manifest = JSON.parse(readFileSync('../build/pages.json', 'utf8'));

export const serverRoutes: ServerRoute[] = [
  {
    path: 'route/:pair',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () =>
      manifest.pages
        .filter(p => p.type === 'route' && p.lang === 'en')
        .map(p => ({ pair: p.path.split('/').pop()! })),
  },
  // same shape for station/:slug and the /ml variants
];
```

**Warning — Angular's SSR history is a minefield.** It went Universal →
`@nguniversal` → `@angular/ssr` → server route config, and most search results
describe dead approaches. If a result mentions `@nguniversal` or `renderModule`
boilerplate, it is stale. You want `provideServerRendering`,
`app.routes.server.ts`, and `RenderMode.Prerender`.

Use **incremental hydration** (`@defer (hydrate on viewport)`) on the 625
content pages. They are mostly static text and should not hydrate an
interactive app to display a timetable — that is how the LCP advantage over a
1.6 MB SPA gets handed back.

**Toolchain gotchas — learned the hard way, do not re-derive:**

- **Angular is pinned to 21 deliberately.** `@angular/cli@latest` now resolves
  to 22.x. Staying on 21.2 because it already carries everything this build
  needs (zoneless, `getPrerenderParams`, incremental hydration) and the local
  npm is fragile (below). Move with `ng update` when there is a reason, not
  because a number changed.
- **`vitest` is pinned to exact `4.0.8`. Do not unpin it.** npm 10.9.2's
  arborist crashes with `Cannot read properties of null (reading 'edgesOut')`
  resolving vitest 4.1.x's optional peer `@vitest/browser-playwright`. A
  corrupt npm cache made this worse; `npm cache verify` cleared it.
- **`angular.json` budgets cannot express gzip** — `InitialCalculator` sums
  raw bytes and the schema has no gzip option. The CLI's printed "estimated
  transfer size" is display-only and never gated. So the real gate is
  `app/scripts/check-bundle-size.mjs`, wired into `npm run build`; the
  `angular.json` budget is only a calibrated raw backstop. Both were proven
  to fail on breach, not assumed.
- **Tailwind's default `--text-*`, `--color-*` and `--font-weight-*`
  namespaces are cleared, not extended.** `text-xs`, `text-sm`, `font-light`
  and the default palette do not exist as utilities, so no later phase can
  physically ship sub-16px text or an unverified colour.
- Tailwind v4 `@utility` blocks only emit when used, so `tabular-nums` and
  friends are absent from the CSS until a component references them. That is
  correct behaviour, not a missing token.
- **Tailwind v4 mints utilities from English words in `.ts` comments.** The
  words "absolute", "relative" and "table" in prose emit `.absolute`,
  `.relative`, `.table`. **This is accepted, not a bug to fix.** The rules are
  dead CSS — no element carries those classes — and the dangerous namespaces
  are already cleared, so prose can only mint inert layout rules. The obvious
  fix (`@import 'tailwindcss' source(none)` with `.html`-only `@source` globs)
  would stop Tailwind seeing classes in `.ts` files, and a silently missing
  dynamic class is a real visual bug. Do not trade that away.
  **But the cost is not uniform and it scales with prose.** `absolute` /
  `relative` / `table` cost ~20 bytes each. `shadow`, `filter` and `invisible`
  cost **2.97 KB raw / 0.45 KB gzipped between them**, because Tailwind v4
  expands those into `@property` blocks for the whole variable chain. Phase 3's
  specs tripped exactly those three and rewording them returned the bundle to
  75.87 KB. Watch for it in Phases 4-6; the bundle gate will catch a bad one.

- **A `noscript` element may contain TEXT ONLY, never child elements.** With
  JavaScript *enabled* the browser parses its contents as one raw text node and
  never builds DOM from it, while Angular's server render emits real elements —
  so a single `<p>` inside one is an automatic **NG0500 hydration mismatch** at
  runtime. It builds clean, tests clean, and only fails in a real browser,
  which is how it reached Phase 5 in all three page templates. Do not style the
  element either: author CSS beats the UA `display:none` and would reveal the
  fallback to everyone. If block formatting is genuinely needed, put the markup
  in `index.html`, outside the hydration boundary.
  This class of bug is invisible to `npm run build` and `npm run test:ci`.
  **Open the app in a browser and read the console before calling a phase
  done.**

- **The `noscript` rule is about the hydration boundary, not about `noscript`.**
  Angular's own build puts `<noscript><link rel="stylesheet" ...></noscript>` in
  the `<head>` of every prerendered document — that is the critical-CSS
  fallback and it is correct, because hydration only reconciles the app root's
  DOM and nothing in `<head>` is ever touched. Inside the boundary the same
  markup is fatal. A checker that greps whole documents flags Angular's own
  output; `scripts/check-bundle-size.mjs` scans from `</head>` on, and that
  distinction is the check, not a detail of it.

- **Prerendering 1,250 routes is cheap in time and expensive in memory.**
  Measured on this machine, cold `dist/`: `ng build` 23.6 s for 1,252 documents
  against 12.1 s for one, so the prerender itself is ~12 s, about 9 ms a page.
  Peak resident memory is **~2.3 GB across up to 9 node processes**, ~1.6 GB in
  the largest. That is the number to watch on a CI runner with a 2 GB cap, not
  the wall time. `npm run build` end to end is ~44 s, of which ~20 s is the
  gate reading all 1,253 documents back.
  Output: **49 MiB of HTML, ~12 MiB gzipped, mean 40 kB a page** (9.2 kB
  gzipped). Most of a page is Angular's inlined critical CSS (10.9 kB) and the
  event-replay bootstrap; the per-page data slice is ~1 kB. Cloudflare Pages
  caps a deployment at 20,000 files and 25 MiB a file; this is 1,274 files with
  a 590 kB maximum, so there is an order of magnitude of headroom on both.

- **The bundle gate must strip comments before it looks for `pages.json`.**
  It matches the filename inside quotes so that prose cannot trip it — but
  JSDoc marks up code with backticks and backticks are also template-literal
  delimiters, so every comment that *documents* the rule read as a violation of
  it. A gate that punishes documenting the hazard it enforces is a gate people
  route around. It strips `//`, `/* */` and `<!-- -->` first now.

**Considered and rejected:** Astro is the purest fit for "1,250 static pages
plus two widgets" and would ship near-zero JS on content pages, but its Angular
island support is community-grade, so it would mean leaving Angular for the
interactive parts too. Angular's deferrable views get close enough.

**~~Still open — the map.~~ Resolved in Phase 7: Leaflet + CARTO, and the
schematic is the fallback.**

The earlier text is kept below because the reasoning was not wrong, only
outranked. It read: *MapLibre GL is ~200 KB gzipped, larger than Angular
itself, to draw two polylines, 25 dots and ~17 markers. For a single line a
schematic is what every metro in the world puts on the wall, and it is what
answers "which direction, which train". A geographic basemap also drags in
CARTO's tile quota and terms. Recommendation: schematic first, geographic map
as a second view once the engine works.*

**The user overrode it, and the override stands.** The brief was a screenshot
of the competitor's Leaflet + CARTO map and the words *"i need to bring the map
like showing train status"*. Do not relitigate this. What actually changed
against the old reasoning:

- **Leaflet, not MapLibre.** ~42 KB gzipped, not ~200. The old paragraph priced
  the wrong library; at Leaflet's weight the argument from bundle size does not
  survive, and it is lazy-loaded so the initial bundle does not pay for it at
  all (96.28 KB gzipped against the 150 KB gate, with Leaflet in a chunk no
  prerendered document even references).
- **The schematic was not deleted, it was demoted.** `shared/schematic.ts` is
  untouched and renders inside `shared/map/line-map.ts` the moment the tiles
  cannot be fetched. That is the offline story, and it is better than the map:
  no competitor's map works with the network off and ours draws the whole line.
- **The crawlable links had to be replaced, not lost.** The schematic carried
  25 SVG anchors on every station and route page and search strategy 2 rests on
  that cross-linking. A raster map has no anchor text at all, so the map
  section now ends with a collapsed, always-prerendered index of all 25
  stations as plain links. The home page gained 25 links it never had.
- **Positions are interpolated along the alignment, not between stations.**
  `core/engine/positions.ts`. The sketch further down this file interpolates
  latitude and longitude between two stops; on this line that visibly cuts the
  corner at Edapally. Interpolate `stop_dist` chainage and resolve it against
  `shapes.txt`.

**Still open, and now it matters: CARTO's terms and quota.** The basemap is
`basemaps.cartocdn.com` (Positron and Dark Matter). Attribution to
OpenStreetMap and to CARTO is rendered as real 16 px text under the map, which
the licence requires. What has *not* been checked is CARTO's rate limit and
whether their free basemap tier permits a commercial product — the same
question the old paragraph raised, still unanswered, and now load-bearing
rather than hypothetical. Check it before launch; the fallback if the answer is
no is another tile host, not another library.

**Also unresolved by design: stations and track are different published
points.** `stops.txt` gives a station's coordinate and `shapes.txt` gives the
viaduct's, and they disagree by up to **75.8 m** (Vadakkekotta on `R1_0`, Aluva
on `R1_1`) — measured across all 25 stations and both shapes. So a train
standing at a platform does not sit exactly on the station dot. Both numbers
are KMRL's; moving either to make them agree would be modifying the data, which
the licence forbids. `positions.spec.ts` asserts the 100 m envelope rather than
pretending to a precision the feed does not have.

---

## Gaps in the leave-by engine (the signature feature)

The formula in the original doc is right, but three inputs are unspecified:

1. **First/last-mile walking time.** No source named. Options: OSRM / Valhalla /
   GraphHopper on OSM data (more hosting), or straight-line × detour factor.
   Straight-line is badly wrong in Kochi — rivers, rail lines and one-ways cut
   across everything. Start with a detour factor, label it as an estimate.

2. **Time inside the station.** Security check, ticket/QR purchase, stairs or
   lift. Typically 3–6 minutes and **entirely missing from the formula.** Store
   it per station and make it configurable.
   **Closeable by fieldwork:** `fieldwork/station_survey.csv` has
   `street_to_platform_sec`, `platform_to_street_sec` and
   `security_queue_typical_sec` per station. Measure them on the same ride
   that collects coach position — a real number here is the difference between
   the signature feature being right and being wrong.

3. ~~**Frequency vs timetable.**~~ **RESOLVED — the timetable is exact.** No
   `frequencies.txt`; every `stop_times` row is a real timepoint. The engine
   can name a specific train ("the 08:37"), which is the stronger output. Only
   gaps 1 and 2 remain open.

Also: most users don't start at a station. Until the product is multimodal, the
leave-by answer is really "be at station X by T". Say so in the UI.

---

## Honesty rules (non-negotiable — this is the differentiator)

- Never label an interpolated position as live or as GPS. Use "Scheduled
  position" or a visually distinct marker.
- Never show "LIVE" when the source data is stale.
- Never promise exact arrival: "Expected 08:37" or "~08:37", not "Exactly".
- Never pretend realtime is available offline.
- The freshness model (LIVE / RECENT / STALE / UNAVAILABLE) from the original
  doc is good — keep it, and add a "SCHEDULED" state for interpolated data.
- Add an **EXPIRED** state above all of those — but fire it on *confirmation
  staleness*, not on `feed_end_date`, which lapsed while the timings stayed
  accurate (finding 6). Warning about a feed the operator has confirmed is
  correct would itself be dishonest.
- Honesty cuts both ways: do not overstate uncertainty either. State
  provenance and its date, then stop.
- Never state operating hours, frequency or fares as hardcoded copy. Derive
  them from the feed, or they drift from the data silently (the competitor's
  "6:00 AM – 10:30 PM" card is wrong for exactly this reason).

---

## Schedule-based position engine

This is the entire "live map" trick — placing a train from the timetable alone:

```python
# find the two stations the trip is between at time `sec`
for i in range(len(rows) - 1):
    if rows[i]["dep"] <= sec <= rows[i+1]["arr"]:
        prev_row, next_row = rows[i], rows[i+1]
        break

t = (sec - prev_row["dep"]) / (next_row["arr"] - prev_row["dep"])   # 0..1
lat = lat1 + (lat2 - lat1) * t
lon = lon1 + (lon2 - lon1) * t
```

Run it every second in the browser; snap to `shapes.txt` instead of a straight
line to follow the viaduct.

`gtfs_inspect.py` (repo root) implements this and is verified against synthetic feeds,
including the case most implementations get wrong: at 00:10 it correctly finds
trains that departed 23:40 on the *previous* service day, via `24:00+` times.

### Transit semantics that bite

- GTFS times exceed 24:00 (`25:10:00` = 01:10 next day). **Never parse with
  JavaScript `Date`.** Treat as seconds-offset from service-day start.
- A trip after midnight belongs to the **previous service day**.
- Service day ≠ calendar date. Honour `calendar.txt` + `calendar_dates.txt`.
- Timezone `Asia/Kolkata`; store UTC, display IST.

---

## Search strategy (how this gets users)

Traffic comes from search. Beating the field there is structural, not a matter
of better tags.

| | KMRL official | keralam.co | us |
|---|---|---|---|
| Indexable pages | 25 | 1 | **1,250** |
| Unique titles | **no — all identical** | yes | yes |
| Sitemap | **404** | 1 URL, Oct 2024 | generated, hreflang + x-default |
| O→D pages | no | no | **600** |
| Malayalam | station name only | no | full |
| Data correctness | good, clock 1 h fast | 4 trains lost, midnight bug | correct |

Neither incumbent can serve a query that needs its own page. `build_pages.py`
emits **1,250 prerendered pages** — 25 stations + 600 ordered pairs, in English
and Malayalam — each carrying real timings, fares, durations and stop lists.

These are not doorway pages. Every one answers a distinct query with distinct
data:

```
Aluva -> Edapally    114 trains Mon-Sat, 89 Sun, 17 min, Rs 40, 7 stops between
MG Road station      242 trains/day, first 5:25 AM, last 11:44 PM
```

Priorities, in order:

1. **Prerender everything.** Content in the HTML source. This is the decisive
   advantage — Googlebot renders JS on a deferred queue and unreliably for
   content behind a 1.6 MB fetch.
2. **Cross-link.** Every station page links its 24 destinations. Internal
   linking is how these get discovered and valued.
3. **Be correct where they are wrong.** They dropped every pre-06:00 trip, so
   for *"first metro from MG Road"* they answer 6-something and we answer
   **5:25 AM**. Same for last-train queries, where their midnight handling
   breaks. Correct answers on queries that already have traffic is the most
   defensible position available.
4. **Malayalam is uncontested.** They ship `translations.txt` and never use it
   for content. Near-zero competition on Malayalam transit queries.
   `hreflang` pairs are already in the generated sitemap.
   **All Malayalam copy is machine-written and must be reviewed by a native
   speaker before launch** — `build_pages.py`'s meta copy *and* the UI
   catalogue in `app/src/app/core/i18n/strings.ts`, which as of Phase 6 is the
   entire interface, not just station names. The station names themselves are
   safe: they come from KMRL's own `translations.txt`, so they are the
   operator's spelling rather than ours. Everything else is a draft. The
   sentences to read first are the last-train ones — `station.strand`,
   `route.strand`, `board.laterShort` and the `faq.*` answers — because a
   mistranslation there strands somebody. Known rough edge: the catalogue
   attaches case suffixes with a hyphen (`ആലുവ-ൽ`), which is a transliteration
   habit, not Malayalam.
5. **Structured data** — `Schedule`/`TrainTrip`, `Place` per station,
   `BreadcrumbList`, `FAQPage` for first/last/fare questions. Theirs is a bare
   `WebSite` object.
6. **Core Web Vitals.** We win LCP by default (prerendered HTML + 7.2 KB of
   data). Do not give it back — this is another argument for schematic-first
   over a 200 KB map library.

7. **Alias the spelling variants.** KMRL and the feed disagree, and passengers
   search all of them: Pettah/Petta, Thykoodam/Thaikoodam,
   Tripunithura/Thrippunithura, Edapally/Edappally, MG Road/M.G Road. Pick one
   canonical URL per station and 301 the variants to it, rather than letting
   the variant queries miss.

Do **not** copy keralam.co's keyword-stuffed `<meta name="keywords">`. Google
dropped it as a signal around 2009.

**Two defects of our own, found and fixed in Phase 6.** Both were in
`build_pages.py`, both had been in every count of "1,250 indexable pages", and
neither was visible from the app.

1. **The sitemap listed 625 URLs, not 1,250.** Only the English path got a
   `<loc>`; the Malayalam one appeared solely as an `xhtml:link` alternate, so
   half the site had no `<loc>` anywhere in the sitemap. There was no
   `x-default`, and `/` and `/ml` — the two URLs most likely to be linked to —
   were missing entirely. It now emits a `<url>` per language, each declaring
   both plus `x-default`, and the two home pages: **1,252 URLs.**
   `check-bundle-size.mjs` now fails the build if the sitemap and the
   prerendered set disagree on count or on origin.

2. **The station meta description advertised the train that strands you.**
   `last_departure` was the latest departure from the station in *any*
   direction, which at 20 stations is the short-turn to Muttom — so the
   description for MG Road read "last train 11:44 PM" and for Aluva "10:51 PM",
   in a search result where nothing can correct it. This is finding 9 leaking
   into the one place the reader sees before they ever reach the page. The
   summary now carries `last_through_departure` as well and the description
   uses it: MG Road 10:59 PM, Kalamassery 11:10 PM, Aluva 10:30 PM — all of
   which agree with finding 9's own table.

**What not to chase:** bare station-name queries ("kalamassery metro station").
KMRL's domain authority will carry them there despite the identical titles.
Target the qualified queries neither incumbent can serve — O→D pairs, fares,
first/last train, Malayalam, and leave-by.

**Realistic timeline:** the long tail is winnable within weeks of indexing
because nobody is competing for it. Head terms are authority-driven — plan on
months. Long tail builds the authority that eventually contests them. Register
a real domain before launch rather than shipping on `*.pages.dev`.

---

## Immediate next steps

1. ~~Download and inspect the feed.~~ **Done** — see findings 4–6.
2. ~~Ask KMRL whether the feed will be refreshed.~~ **Answered** — timings
   confirmed accurate; see finding 6. Still open: **is there a GTFS-RT
   endpoint an external developer can access?** Draft:
   `docs/kmrl-opendata-email.md` (now realtime-only).
3. Build the GTFS→JSON build step. Ship a fare lookup map, a stop list, shapes,
   and stop_times — the whole network compacts to **7.2 KB gzipped**, so
   precache all of it in the service worker and the app works fully offline.
   **Verify trip counts survive the conversion** — the competitor silently
   lost 4 trips here (finding 7).
   Page manifest is already done: `python3 build_pages.py KMRLOpenData`
   → `build/pages.json` + `build/sitemap.xml` (1,250 pages).
4. Build the MVP: static PWA — station list + map, next departures, first/last
   train, A→B time and fare, leave-by with station-access time. Bilingual.
   Expiry banner. No backend.
5. **Add a weekly feed-watch job.** A GitHub Action that fetches
   `KMRLOpenData.zip`, hashes it, and opens a PR when it changes. This is the
   only mechanism that catches a KMRL republish — finding 6's assurance is
   dated, and they have already shown they change things without announcing
   them. A diary reminder will not survive contact with a year.
6. Then: walking routing, favourites; realtime only if (a) comes back yes.
7. Then: Line 2 / Water Metro — where OpenTripPlanner and a real backend start
   to pay off.

---

## Sources

- KMRL open data & terms: https://kochimetro.org/open-data/
- Feed: https://kochimetro.org/opendata/KMRLOpenData.zip
  (local copy: `KMRLOpenData/`, extracted 2026-09-22)
- Competitor: https://kochimetro.keralam.co/
  (source studied at `../kochi-metro-timings-main/`)
- KMRL's own station pages: https://corporate.kochimetro.org/metro-stations
  (their TLS chain omits the intermediate cert — some fetchers fail, curl works)
- Contact: opendata@kmrl.co.in
