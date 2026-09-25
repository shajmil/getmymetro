# getmymetro — product truth

Derived from `CLAUDE.md` (findings 1–11), which remains the authority for data
facts. This file carries only product truth: who it is for, what it must do,
and what is forbidden.

## What it is

A free journey app for the Kochi Metro: one line, 25 stations, Aluva to
Tripunithura. Static PWA, no backend, no accounts.

**Product statement:** "Know when to leave, not just where the train is."

## Who uses it

Daily commuters on mid-range Android phones, on patchy connections, often in a
hurry. **A significant share are elderly.** Legibility and speed of
comprehension outrank expression everywhere. Many read Malayalam first.

The primary scene is standing on a platform or walking toward a station — not
sitting at a desk. One hand, bright sunlight, small screen.

## The job to be done

Both competitors answer *"when is the next train?"*
**We answer *"am I going to be OK?"*** That is the product.

Concretely:
1. **Am I going to make it home?** The last train that actually reaches my
   destination — not the one that terminates at the depot.
2. **When should I leave?** Leave-by, once walking time is known.
3. **Which platform?** In station names, not terminus jargon.
4. **What does it cost?** Exact fare, from the published table.

## Non-negotiable truths

- **No realtime exists.** No GTFS-RT feed is published. Every position and
  time is derived from the static timetable. **Never label anything "live".**
  The map says so in body type as its second line - *"Scheduled positions,
  worked out from KMRL's timetable on your phone. No live tracking is published
  for this metro, so nothing here is measured."* - not in small print under the
  frame, which is exactly where keralam.co puts its disclaimer while its title
  says "Live Map".
- **The advertised last train strands people.** At 20 weekday platforms the
  final towards-Aluva departure terminates at Muttom, 51–53 minutes after the
  last through train. Always lead with the train that actually arrives.
- **20 of 450 trips terminate early** and must be labelled on any board.
- **Fares come from the 625-pair table**, never computed.
- **Holidays are unknown.** No `calendar_dates.txt` exists; Sunday service
  starts up to 103 minutes later. Say so honestly, without alarm.
- Attribution is a licence condition: "Contains data provided by Kochi Metro
  Rail Limited", and never imply KMRL endorses this. The basemap carries its
  own: OpenStreetMap and CARTO, rendered as real 16 px links under the map
  rather than in Leaflet's 12 px control, because nothing in this app goes
  below 16 px. **Open before launch:** whether CARTO's free basemap tier
  permits a commercial product, and what its rate limit is.

## Competitors

- `kochimetro.keralam.co` — Leaflet + CARTO map, schedule-interpolated trains.
  Loses the first 4 trains of the day; last train vanishes at midnight.
- `corporate.kochimetro.org` — official, 25 station pages, clock ~1 hour fast,
  all 25 pages share one title.
- `trackmymetro.com` — route pages per station pair.

None of them label short-turns. None answer the last-train question correctly.

## What we have built

Angular 21 zoneless PWA, 7.2 KB data bundle (whole network), tested engine,
1,252 prerendered pages in English and Malayalam, full offline support, and a
Leaflet + CARTO map of the line with every train on it, interpolated from the
timetable.

**Phase 7 answered the standing complaint - "so many features, can't find
them".** A-to-B journeys, fares and the 600 route pages were three taps deep,
through the station page. They are one tap from the home screen now, behind
labels that say what they are. The rules that got them there, and that any
later phase inherits:

- **The answer stays first.** Next departures at your station, zero taps. The
  map sits immediately below it and never above it.
- **Words, not icons alone.** No hamburger-only navigation, no horizontal
  carousel, no icon-only control. Every way into the app is a 56 px row with
  a sentence in it.
- **The schematic is the offline fallback, not a second view.** The map is the
  default everywhere it appears; `shared/schematic.ts` renders automatically
  when CARTO's tiles cannot be fetched, so the app stays whole with the network
  off - which no competitor manages.
- **A raster map has no crawlable anchor text.** The schematic used to carry 25
  station links on every page and the search strategy rests on that
  cross-linking, so the map section ends with a collapsed, always-prerendered
  index of all 25 stations as plain links. The home page gained 25 it never
  had.

## Forbidden

Realtime claims, crowding, disruption alerts, accessibility filtering
(`wheelchair_boarding` is `1` for all 25 stations, so it carries no signal),
feeder-bus routes (no data exists), login, payments.
