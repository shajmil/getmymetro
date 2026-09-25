# GetMyMetro — "The line" design spec

The source of truth for the redesign. Screens are in `screens/` (PNG) and `html/` (static reference HTML — open in a browser, inspect for exact values). **The HTML is a visual reference, not code to paste.** Rebuild it properly as components in the app's own stack.

## 1. The idea

**The metro line is the interface.** One thick teal line runs *down* through the personal journey (origin → destination) and *across* the departure board (Aluva ← you → Tripunithura). Everything hangs off it. White space, big numbers, one teal, no dark panels.

Product promise: *know when to leave, not just where the train is.*

Golden rules
- The next train must be understandable in under 3 seconds.
- Both directions are visible together, without scrolling past separate cards.
- Colour never carries meaning alone: every state also has a shape, a label or a position.
- If an element doesn't help comprehension, navigation, trust or identity, remove it.
- No gradients, glass, blobs, drop shadows, decorative illustrations, emoji icons or dark information panels.

## 2. Tokens

See `tokens.css` (CSS custom properties) and `tokens.json`.

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--gmm-line` | `#00A3B4` | The line itself (graphic only, **never text**) | 3.0:1 as graphic |
| `--gmm-line-text` | `#00707C` | "Your train" text, your countdown, primary button fill | 5.8:1 (white on it 5.8:1) |
| `--gmm-line-dark` | `#005C66` | Primary button hover / pressed | — |
| `--gmm-line-soft` | `#E2F4F6` | Selected row background | — |
| `--gmm-ink` | `#101114` | Primary text, destination node, selected toggle | 18.4:1 |
| `--gmm-ink-2` | `#55575E` | Secondary text | 7.3:1 |
| `--gmm-ink-3` | `#6A6D74` | Tertiary text, arrows between times | 4.7:1 |
| `--gmm-bg` | `#FFFFFF` | Journey ground | — |
| `--gmm-soft` | `#F3F5F4` | Departure board ground | — |
| `--gmm-grey` | `#C4C7CA` | Track in the direction you're *not* taking; control borders | — |
| `--gmm-rule` | `#E3E5E4` | Hairline dividers | — |
| `--gmm-amber` | `#9A4A00` | Short-working trains ("Ends at Muttom"), warnings | 5.7:1 |
| `--gmm-amber-soft` | `#FCEBD5` | Alert background | — |
| `--gmm-skeleton` | `#E7EAE9` | Loading placeholders | — |

## 3. Typography

- **Geist** (Google Fonts) for everything. **Noto Sans Malayalam** for Malayalam.
- `font-variant-numeric: tabular-nums` on **every** time, countdown, fare, duration and count.
- Big numbers are semi-bold (600) with tight tracking — they should read like transit information, not a finance dashboard.

| Role | Size / weight / tracking |
|---|---|
| Countdown (mobile / desktop) | 96 / 132px · 600 · −0.06em · line-height 0.8 · unit ("min") at ~23% of size |
| Board countdown | 52–60px · 600 · −0.05em |
| Station name (journey) | 30px mobile, 44px desktop · 600 · −0.035em · line-height 1.15 |
| Departure / arrival time | 30px (22px for arrival) · 600 · −0.03em; "PM" at 16px ink-2 |
| Lane head (ALUVA / TRIPUNITHURA) | 16px · 600 · uppercase · +0.04em |
| Section label (DEPARTURES) | 16px · 600 · uppercase · +0.05em |
| Body / meta | 16–17px · 400 · line-height 1.5 |
| **Minimum anywhere in the UI** | **16px** |

Malayalam: no uppercase; line-height ≥ 1.45; station names 25px; never force into English-sized boxes — let rows grow and wrap at spaces, never mid-word.

## 4. Geometry

- Spacing on a 4px base: 4, 8, 12, 16, 20, 28, 40.
- Radius: 8 (toggle segments), 10 (secondary buttons), 12 (primary button, inputs, alerts), 16 (desktop board panel). Circles for nodes. No pills, no 24px+ card radii.
- Mobile: 20px side gutters. Reference 390×844; must work at 360, 375, 390, 412.
- Desktop: 12-column grid, 24px gutters, 80px margins, ~1280px content. Journey in columns 1–6, board in 8–12, full-width line strip across the bottom.
- Touch targets ≥ 44px (primary action 56px). 8px+ between targets.

## 5. Components (build once, reuse everywhere)

### 5.1 `JourneyLine` — the vertical line
A 30px rail column + content column. Built as **rows**, so it grows with content (Malayalam, large text) — never fixed heights.
- Line: 10px wide, `--gmm-line`, square ends so rows join seamlessly.
- Nodes (centred on the line, 22px down from the row top so they align with the station name's first line):
  - **Origin / you're here:** 26px ring, white fill, 5px `--gmm-line` border.
  - **Destination:** 28px filled `--gmm-ink` disc with 4px white border.
  - **Stop passing through:** 16px ring, 3px border.
  - **Not chosen yet:** 26px ring, 4px dashed `--gmm-grey`.
- Row types: `first` (line from node down), `through` (full height), `last` (line down to node).
- Variants: solid teal (normal), **dotted grey** (no destination chosen), **solid grey** (no service).
- Used by: Home journey, Route stop list, Choose-destination list.

### 5.2 `JourneySummary` (Home hero)
Row 1: origin name · "You're here" · **Change** button (44px, secondary).
Row 2 (on the line): "■ Your train · towards Tripunithura" (line-text) → giant countdown + "Leaves 6:21 PM" right-aligned → meta "3 min ride · 1 stop · ₹fare".
Row 3: destination name · "Arrives 6:24".
Then the primary button: **Book on KMRL WhatsApp** (teal, white text, ↗ icon, announces "opens WhatsApp").

### 5.3 `LineTrack` — the horizontal line
Full-width SVG, 10px line, you are a 24px ink-ringed node in the middle.
- Left half → Aluva, right half → Tripunithura. **Always.** (Same order as the network strip.)
- The half in *your* direction is teal; the other is grey. Neither chosen → both grey.
- White chevrons at the ends show direction of travel.
- Terminal station (Aluva / Tripunithura): node sits at the end, only one half is drawn.

### 5.4 `DepartureBoard`
Soft-grey panel. Header: "DEPARTURES" + "Timetable · 6:16 PM" (or status). Then `LineTrack`, then two lanes in a 2-column grid (28px gap):
- Lane head: "← ALUVA" left-aligned / "TRIPUNITHURA →" right-aligned.
- Your lane: "■ Your train" tag + countdown in line-text colour. The other lane reserves the same tag height so **rows stay aligned across lanes**.
- Countdown, then "6:21 PM · 17 stations".
- Following trains: rows with hairline top border — time (600) left, "13 min" right. Short workings add an amber line "⊣ Ends at Muttom" (icon + text). When one lane has that extra line, the other lane reserves the same height.
- Footer link: "Full board ›" (48px).
- Home shows 1 following train per lane; Station screen shows 4; desktop 3.

### 5.5 `NetworkStrip`
All 25 Line 1 stations on a horizontal teal line; small white dots for stations; ink ring = you, ink disc = destination. Mobile: end labels only (ALUVA / TRIPUNITHURA). Desktop: every station labelled at −50°.

### 5.6 Others
- **Primary button** — teal fill, white text, 56px, radius 12, one per screen. Hover `--gmm-line-dark`; press 1px down.
- **Secondary button** — white, 1px grey border, 44px, radius 10.
- **Language switch** — segmented EN / മല on `--gmm-soft`; selected segment ink with white text; `aria-pressed`.
- **Search input** — 56px, 2px ink border, radius 12, visible label "WHERE TO?", placeholder "Station, in English or മലയാളം".
- **Alert** — amber-soft background, amber icon, bold title, plain explanation, "Try again" button. `role="alert"`.
- **Skeleton** — grey blocks in the exact final layout (including a grey line and nodes); no spinners.

## 6. Screens

| # | Screen | Notes |
|---|---|---|
| 01 | Home | Header → JourneySummary → Book button → DepartureBoard (fills the rest). Both lanes' next train visible in the first viewport. |
| 02 | Home (Malayalam) | Same composition; taller rows, no caps. |
| 03 | Station board | Back · Station search → "STATION / Pathadipalam" → NetworkStrip → "Station 8 of 25 · Line 1" → DepartureBoard with 5 per direction. |
| 04 | Route | Back → "ROUTE / Pathadipalam to M.G. Road" → countdown + 6:21 → 6:36 → meta → JourneyLine listing every stop with times; destination says "Get off here" → Book button. |
| 05 | Choose destination | Back → origin node "From · you're here" → search input → two sections "TOWARDS TRIPUNITHURA →" / "← TOWARDS ALUVA", each a JourneyLine of station rows (name, "N stops · M min", chevron). Selected row: line-soft background, ink node, check. |
| 06 | States | Loading · No destination (dotted line + "Where to?" button) · No service tonight (grey line, "First train tomorrow 6:00 AM", lanes "Closed / Opens 6:00 AM") · Timetable unavailable (amber alert, saved times shown) · Terminal station (one-way track). |
| 07 | Desktop 1440 | Header with nav (Journey / Stations / Line map) → journey (cols 1–6, big) + board panel (cols 8–12) → full-width labelled NetworkStrip. Same components, different composition — not a stretched phone. |
| 08 | Design system | Visual reference for everything above. |

## 7. Motion (150–300ms, state changes only)
- Destination chosen: dotted line fills solid top→bottom, 240ms.
- Board refresh: changed rows cross-fade, 200ms. Numbers swap — never count up or roll.
- Press: 1px nudge, 120ms. Hover: colour only.
- `prefers-reduced-motion: reduce` → all instant.

## 8. Accessibility checklist
- Text contrast ≥ 4.5:1 (all tokens above pass). The `--gmm-line` teal is graphic only.
- Visible focus: 3px `--gmm-line-text` outline, 2px offset, on every interactive element.
- Real `<button>`, `<a>`, `<input>` + `<label>`; `aria-label` on icon-only buttons; decorative SVG `aria-hidden`.
- Line diagrams have a text alternative (e.g. "Line 1, Aluva to Tripunithura. You are at Pathadipalam, station 8 of 25.").
- Heading order is sequential; loading uses `aria-busy` + a polite status message.
- Works at 200% text size: no fixed heights on content, rows grow.
- Test at 360px wide and 1440×900.

## 9. Content style
Short transit language. "Leaves 6:21 PM", "1 stop", "Ends at Muttom", "Arrives 6:24". Never "Your selected train is scheduled to depart at…". Never show raw errors.

## 10. Placeholder data in the mockups
Times, "Ends at Muttom" and "First train 6:00 AM" are sample values; fares show as ₹XX. Wire everything to real KMRL timetable/fare data. Malayalam strings should be reviewed by a native speaker.
