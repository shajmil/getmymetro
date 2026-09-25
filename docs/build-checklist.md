# Build checklist

Six phases, one agent each, verified before the next starts. Read `CLAUDE.md`
first — findings 1-11 and the MVP feature scope are the source of truth.

---

## Non-negotiable design constraints

These apply to every phase. A phase is not done if it breaks one.

### Legibility (the primary user is not young)

| Rule | Value |
|---|---|
| Body text | **18px minimum**, never below 16px anywhere |
| Departure times (the main content) | **36-44px**, tabular numerals |
| Station names | 20-24px |
| Touch targets | **56x56px minimum**, 8px apart |
| Contrast | **7:1** for text (AAA), 4.5:1 absolute floor |
| Line height | 1.5 body, 1.2 large numbers |

No grey-on-grey. No thin weights below 400. No text over photographs.

### Speed (mid-range Android on a patchy connection)

- **No animation library.** CSS transitions only, **≤150ms**, and only on
  colour/opacity/transform. Nothing animates on load.
- Honour `prefers-reduced-motion: reduce` by disabling all transitions.
- **No MapLibre.** ~~Inline SVG schematic~~ - **superseded in Phase 7**: the map
  is Leaflet + CARTO, lazy-loaded so it is not in the initial chunk, with the
  SVG schematic as the offline fallback. See CLAUDE.md, "Resolved in Phase 7".
  MapLibre remains rejected; the objection was ~200 KB, and Leaflet is ~42 KB.
- Zoneless change detection + signals. No `zone.js`.
- Everything above the fold renders from prerendered HTML with no JS.
- Budget: **LCP < 1.5s** on simulated Fast 3G, **CLS 0**, main bundle
  **< 150KB gzipped** excluding data.

### Layout

- Single column. Primary action within thumb reach (bottom 60% of viewport).
- 16px side gutters, no horizontal scroll at 320px.
- Most important answer highest on the page, largest on the page.
- Dark mode via `prefers-color-scheme`, both themes meeting the contrast rule.

### Honesty (CLAUDE.md honesty rules apply to the UI)

- Never render a time as "live". Label scheduled data as scheduled.
- Short-turn trains **must** be labelled (finding 10) — 20 of 450 trips
  terminate early and an unlabelled departure board will mislead.
- Show provenance and its date, and do not overstate uncertainty either.

---

## Phase 1 — Foundation

Scaffold and the design system. Nothing user-facing beyond a shell.

- [ ] Angular 21 standalone, zoneless, no `zone.js`, strict TS
- [ ] Tailwind with design tokens encoding the table above
- [ ] Noto Sans + **Noto Sans Malayalam** self-hosted (no CDN, no FOUT)
- [ ] Light/dark themes, both verified at 7:1
- [ ] App shell: header, main, language toggle. No router content yet.
- [ ] `npm run build` clean, bundle budget configured to fail the build

**Done when:** `npm start` serves a shell that passes contrast and target-size
checks at 320px width.

## Phase 2 — Runtime data bundle

`build_pages.py` emits the prerender manifest (4MB, build-time only). The app
needs a different artifact: the compact runtime bundle.

- [ ] New script emits `public/data/network.json` — stops, trips, shapes,
      fares, translations, **≤20KB gzipped** (verified lossless at 450 trips /
      10,726 stop events)
- [ ] Typed TS models generated or hand-written to match
- [ ] Round-trip test proving no data loss
- [ ] The 4MB `pages.json` must never reach the client bundle — load it with
      `readFileSync` in server config, never `import`

**Done when:** the bundle is under budget and a test proves it reproduces the
raw feed exactly.

## Phase 3 — Engine (pure logic, no UI)

All of this is testable without a DOM. Test it properly; it is the product.

- [ ] GTFS time as seconds-from-service-day-start. **Never `Date` parsing.**
      `24:01` must render `12:01 AM`, not `12:01 PM`.
- [ ] Service-day resolution: a trip after midnight belongs to the previous
      day. `WK` is **Mon-Sat**, `WE` is Sunday.
- [ ] Nearest station by haversine over 25 stops
- [ ] Next departures per direction, with **short-turn labelling**
- [ ] Last-train cliff: last departure, time remaining, and the gap before it
- [ ] Run nudge: next ≤2min and following ≥8min
- [ ] Fare lookup from the 625-pair table (never computed from distance —
      that misprices 104 of 600 pairs)
- [ ] Holiday guard: a hook that can mark a date as Sunday service, plus the
      honest fallback copy when unknown

**Done when:** unit tests cover midnight rollover, the last train of the night,
short-turns, and a Sunday.

## Phase 4 — Home screen (the flagship)

Zero taps from open to answer.

- [ ] Geolocation → nearest station → both directions, next two each
- [ ] Never *require* location; manual station picker always reachable
- [ ] Platform in plain language: which stations each direction serves
- [ ] Run nudge and last-train mode surfaced at the right times
- [ ] Large-number departure display, live countdown, no layout shift
- [ ] Permission denied / timeout / no GPS all handled without a dead end

**Done when:** opening the app at a station shows the answer with no input,
and every location failure still lands somewhere useful.

## Phase 5 — Station, route and schematic

- [ ] Station view: departures, first/last, platforms, exits, fares
- [ ] Route view: departures, duration, fare, stops between, booking link
- [ ] **Book on WhatsApp** → `wa.me/919188957488?text=Book%20Ticket`,
      labelled as KMRL's channel (licence forbids implying endorsement)
- [x] SVG schematic: 25 stations, tappable, current position marker,
      readable at 320px, no pan/zoom needed to use it
      (Phase 7 demoted it to `<app-line-map>`'s offline fallback; unchanged)

**Done when:** a journey can be planned end to end on a 320px screen.

## Phase 6 — PWA, Malayalam, prerender

- [x] Service worker precaching the shell and the full data bundle;
      **fully usable offline** — no competitor manages this
      (`public/sw.js`, 17 files / 473 kB raw; pages are network-first and fall
      back to the precached client shell)
- [x] Malayalam UI throughout, not just station names. `hreflang` pairs.
      Machine-written copy flagged for native review before launch
      (`core/i18n/strings.ts` — **the whole catalogue is unreviewed**)
- [x] Prerender all 1,250 routes from `pages.json` via `getPrerenderParams`
      (1,252 documents: 1,250 content pages plus `/` and `/ml`)
- [x] Unique title and description per page (KMRL ships 25 identical ones)
      — 1,252 distinct titles and 1,252 distinct descriptions, asserted by
      `scripts/check-bundle-size.mjs`
- [x] `FAQPage` + `Schedule` structured data; generated sitemap
      (plus `TrainStation`, `TrainTrip` and `BreadcrumbList`; sitemap is
      1,252 URLs with `x-default`, and the gate fails if it disagrees with
      the prerendered set)
- [ ] Lighthouse: performance, accessibility, best-practices, SEO all ≥95
      on mobile emulation — **not run.** It needs a browser, and this phase
      had none. Everything Lighthouse would check that can be checked
      statically is now a build-gate assertion instead; the four scores
      themselves are unverified.

**Done when:** the build produces 1,250 prerendered pages and the app works
with the network off.

**Still unverified without a browser** (stated rather than implied):
hydration (no NG0500 at runtime), the service worker actually installing and
serving offline, `localStorage`, geolocation, the 56px targets and 7:1
contrast as rendered, CLS, and LCP.

Phase 7 adds to that list, and its items are the likelier ones to bite:
Leaflet initialising at all inside an Angular-hydrated container; the tiles
loading from CARTO and the failure detection firing correctly when they do not;
the train arrows sitting on the viaduct and pointing the right way on screen;
the 56 px station pins not overlapping into ambiguity at the opening zoom; and
the one unavoidable layout shift - when the tiles fail, a 22rem map frame is
replaced by a ~1600 px schematic, and everything below it moves.

---

## Phase 7 - The map, and finding the features

The standing complaint was "so many features, can't find them". The brief also
reversed the map decision: Leaflet + CARTO, as the competitor has, with train
positions on it.

- [x] `core/engine/positions.ts`: every train placed from the timetable,
      interpolated along `shapes.txt` **chainage**, never along a straight line
      between stations. 15 tests, against the real feed
- [x] `shared/map/line-map.ts`: Leaflet + CARTO, lazy-loaded behind an
      `IntersectionObserver` so no page pays for it until a map is nearly on
      screen. Two direction polylines, 25 tappable 56 px station pins, ~17 train
      arrows updated on the page's existing 1 Hz tick
- [x] "Scheduled positions ... nothing here is measured" in body type directly
      under the heading, never under the map and never the word "live"
- [x] OpenStreetMap and CARTO attribution as 16 px links; Leaflet's own 12 px
      control is switched off
- [x] Tiles fail -> the Phase 5 schematic renders automatically, with a line
      saying the map needs a connection and the times do not
- [x] Home restructured: answer, then map, then a labelled way into every
      feature. 24 priced destinations one tap from the answer; "First and last
      train from X" as its own label, landing on its own section
- [x] All 25 stations as plain prerendered links in the map section, replacing
      the crawlable links the schematic used to carry
- [x] Zero animation at-rules after Leaflet's stylesheet joins the output; no
      font-size below 16 px anywhere in it (five documented edits, see
      `app/public/vendor/leaflet-1.9.4.css`)
- [ ] The map itself, as rendered. It needs a browser and this phase had none -
      see "Still unverified without a browser" below

**Done when:** the answer is still the first thing on screen, the map is the
second, and every feature has a label a commuter can read.

---

## Out of scope

Realtime, crowding, disruption alerts (no data exists — finding 2),
accessibility filtering (`wheelchair_boarding` is `1` for all 25 stations),
feeder bus routes (KMRL's own data is placeholder text), login, payments.
