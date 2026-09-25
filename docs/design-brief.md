# GetMyMetro — art direction brief

Supplied verbatim by the product owner. **This brief wins** over earlier design
guidance in `docs/build-checklist.md` wherever the two disagree, except for the
hard constraints at the end, which are legal, data-correctness or hydration
rules rather than taste.

---

## The ask

This is NOT a normal UI redesign. Treat it as a serious product-design project
that could be submitted to a major digital design award.

The result must feel: exceptionally polished, intentional, distinctive,
premium, editorial, modern, accessible, highly usable, visually memorable,
production-ready.

Do NOT optimise for more decoration. Optimise for:

**Instant comprehension + strong visual hierarchy + distinctive brand character
+ accessibility + responsive quality + detail quality.**

It should look like a product from a top-tier product design studio, not a
generic AI-generated dashboard.

## Quality bar

Think like a senior product designer, a transit information designer, a
typography specialist, an accessibility specialist, a responsive web designer,
and a design-system architect. Every major visual decision must have a reason.

Do not randomly add: gradients, glass effects, blobs, floating cards, excessive
shadows, decorative illustrations, unnecessary icons, excessive animations,
giant hero sections, generic SaaS patterns.

If an element does not improve comprehension, navigation, trust or brand
identity, remove it.

## Visual personality

Create an identity recognisable as GETMYMETRO.

It should NOT look like Google Maps, Apple Maps, generic SaaS, a generic
Tailwind template, generic Material UI, a generic AI landing page, a banking
dashboard or an analytics dashboard.

It should feel like **public transport + editorial design + wayfinding +
Kochi**, and communicate: *"this product understands movement."*

## References — principles, not copies

Swiss information design; London Underground wayfinding; modern railway
departure boards; contemporary editorial websites; high-end architecture
websites; premium mobility products; modern transit applications.

Transit interfaces benefit from strong typography, large glanceable
information, and clear hierarchy rather than dense UI. The design must have its
own identity.

## Brand system — build this before the screens

### Colour tokens

- Canvas: warm bone / off-white
- Primary ink: deep charcoal
- Secondary ink: warm dark grey
- Metro primary: Kochi Metro blue
- Metro soft: very light metro blue
- Operational positive: controlled green
- Warning: muted amber
- Rule: soft warm grey
- Strong rule: medium grey

Blue is a transport identity accent, **not** the background of everything. Use
colour strategically.

**Colour must NEVER be the only mechanism communicating meaning.** Combine with
typography, position, labels, icons, symbols, rules, shape.

### Colour contrast

Prioritise outdoor readability. Test conceptually against direct sunlight, low
brightness, glare, poor displays, older Android screens, reduced vision.

Avoid low-contrast "beautiful grey text". Do not sacrifice accessibility for
aesthetic minimalism.

### Typography

A highly legible modern sans-serif for operational information (Inter / Geist /
Manrope / IBM Plex Sans or similar). A restrained serif may be introduced for
selected large editorial headings **only** if it genuinely improves identity.

Never use serif for countdowns, train times, fares, buttons or operational
information.

Use tabular numerals for departure times, arrival times, countdowns, fares,
duration, station counts. Large numbers must feel like transit information, not
financial dashboard metrics.

Hierarchy:

| Role | Size |
|---|---|
| Display | 48–64px |
| Station / destination | 30–40px |
| Primary journey information | 28–36px |
| Countdown | 44–56px |
| Section heading | 20–24px |
| Body | 16–18px |
| Utility | 16px minimum |

Never make important information tiny to fit the layout.

### Typographic composition

Use typography to create hierarchy instead of adding containers. `PATHADIPALAM`
/ `5 min` / `6:21 PM` / `Towards Tripunithura` should have dramatically
different hierarchy. The eye should know where to look within about one second.

Use weight, size, spacing, alignment, tabular numerals, uppercase labels and
subtle rules instead of excessive cards.

### Grid

Real responsive layout system. Desktop 12-column, max content width
~1200–1280px, large screens 1440px+. Asymmetric layouts, intentional negative
space, editorial alignment, strong vertical rhythm, consistent gutters.

**Do NOT simply put the mobile layout inside a centred desktop container.**
Desktop should feel intentionally designed for desktop.

### Mobile first

Primary reference 390×844. Must work exceptionally at 360, 375, 390, 412px. Do
not design at 430px and assume it scales down.

The first viewport should feel complete and purposeful. Avoid excessive
vertical padding, huge heroes, oversized headers, unnecessary navigation,
nested scrolling, horizontal scrolling.

### Thumb and one-hand usability

Assume the user is standing, walking, one-handed, carrying something, outdoors,
in a crowded station. Primary interactions ~44–48px minimum touch areas. Do not
make critical controls tiny.

### Elderly-friendly

Must work for an elderly commuter **without looking "elderly"**. Do not solve
accessibility by making everything ugly or oversized. Use excellent contrast,
large operational numbers, clear labels, predictable placement, strong spacing,
obvious actions, familiar symbols, simple language, minimal cognitive load.

Accessibility is a design foundation, not an afterthought.

### Visual rhythm

Avoid "everything is a card". Mix open sections, rules, typography, full-width
bands, contained surfaces, subtle background changes, grid alignment. Only major
conceptual objects get strong containers.

**Target: maximum 2 dominant contained surfaces in the initial mobile
viewport.**

### Border / radius

Restrained geometry. Radius 8 / 10 / 12 / 14px. Avoid 24px+ giant rounded
cards, excessive pills, every button a pill, nested rounded containers. A border
should communicate grouping or separation.

### Shadows

Extremely sparingly. Prefer borders, contrast, spacing, background changes over
`box-shadow: 0 10px 40px`. Sophisticated and architectural, not SaaS template.

### Iconography

Consistent family, simple, consistent stroke weight, recognisable small,
supporting text rather than replacing it. No decorative icons to fill space. **No
emojis as interface icons.** Pair symbols with text for critical transit info.

## The station board — the visual signature

Think **real railway departure board** translated into a beautiful modern mobile
interface. Both directions must feel like two lanes of the SAME physical board.

Conceptual structure (do not reproduce literally — create a sophisticated
interpretation):

```
STATION DEPARTURES

TOWARDS TRIPUNITHURA      TOWARDS ALUVA
5 min                     2 min
6:21 PM                   6:18 PM
17 stations →             7 stations →
```

It should immediately communicate direction, departure, countdown, route
relevance, service termination.

## "Your train" state

The selected journey needs a distinct visual state — but NOT a huge glowing
card. Use an accent rule, a small marker, stronger typography, restrained
background, a directional indicator. The user should instantly understand:
**this is my train.**

## Personal journey answer — the hero

An information composition, not a generic card:

```
PATHADIPALAM
↓
EDAPALLY

YOUR TRAIN
5 min
6:21 PM → 6:24 PM
3 min · 1 stop · ₹XX
TOWARDS TRIPUNITHURA

[ Book on KMRL WhatsApp ]
```

Hierarchy through typography and structure. No decorative UI.

## Responsive art direction

Do not shrink desktop. Same design language, different compositions.
Mobile: vertical information hierarchy. Desktop: asymmetric editorial
composition.

Desktop must not leave huge empty areas simply because the viewport is large —
spacious, not empty. Mobile must not compress everything — breathing room
between conceptual groups, scannable rather than a wall of information.

## Animation

Motion must communicate state. Subtle transitions **150–300ms**.

Allowed: destination selection, board updates, focus states, expanding route
details, subtle page transitions.

Avoid: bouncing cards, exaggerated scaling, parallax, animated numbers, flashy
gradients, excessive page transitions.

Should feel like a premium transport system, not a marketing website.

## Microinteractions

Station selector focus, destination selection feedback, train row hover,
selected journey marker, subtle board refresh, button press feedback, language
switching, route direction emphasis, keyboard focus, loading skeletons. All
subtle.

## Loading, empty and error states

**Loading:** no generic spinners everywhere. Skeleton states that preserve
layout hierarchy. The page must not jump when data loads.

**Empty:** design them intentionally — no destination selected, no useful train
remaining, terminal station, no service tonight. Explain what happened and what
to do.

**Error:** graceful — timetable unavailable, station data unavailable,
destination unreachable, booking link unavailable. Never show raw technical
errors.

## Accessibility

WCAG-conscious. Sufficient contrast, visible keyboard focus, semantic
hierarchy, screen-reader-friendly labels, accessible buttons and form controls,
touch-friendly targets, **no information communicated through colour alone**,
readable at increased browser font sizes. Usable with increased text size — do
not rely on fixed heights for important content.

## Malayalam quality

Malayalam must not feel like an afterthought. Design and test with real
Malayalam strings. Check line height, glyph density, wrapping, button height,
station names, direction labels, destination picker, navigation, board rows.

**Do not force Malayalam into English-sized containers.** The layout must adapt
naturally.

## Content design

Concise transit language. Every word must earn its place.

- "Leaves at 6:21 PM" not "Your selected train is scheduled to depart at 6:21 PM."
- "1 stop" not "This journey contains 1 intermediate station."
- "Ends at Muttom" not "This service terminates at Muttom."

## Data visualisation

Do NOT turn timetable information into charts. Transit information is not
analytics. Use rows, timelines, departure boards, route diagrams, typography,
directional indicators — not bar charts, pie charts, KPI dashboards or graphs.

## Map design

The map supports the journey rather than dominating it. Simplify aggressively.
Prioritise stations, route, current/selected station, destination, train
direction. Avoid unnecessary geographic detail. Prioritise network
relationships and clarity over geographical realism.

## Design system documentation

Reusable tokens/components for: colours, typography, spacing, grid, radius,
borders, buttons, inputs, station rows, departure rows, journey summaries,
direction headers, route indicators, map containers, alerts, empty states,
loading states.

The screens must feel like one product, not eight individually designed
mockups. If a component appears on Home, Route and Station it must feel like
the same component. Consistency creates trust in transit products.

## Detail pass

After the first implementation, do a second pass purely for visual quality:
alignment, spacing, typography, hierarchy, colour, contrast, icon consistency,
responsive behaviour, empty space, component consistency, mobile usability,
desktop composition.

Improve anything that looks generic, template-like, AI-generated,
over-designed, under-designed, inconsistent or unnecessary. Do not stop at
"functional".

## Final quality test

1. Can someone understand the next train within 3 seconds?
2. Can they compare BOTH directions without scrolling through separate giant cards?
3. Can an elderly user understand the hierarchy?
4. Does it remain readable outdoors?
5. Does it work at 390×844?
6. Does it work at 1440×900?
7. Does Malayalam remain visually correct?
8. Does it still work with larger text?
9. Does it feel like a transit product rather than SaaS?
10. Is the identity distinctive enough to recognise without the logo?
11. Are there only a few genuinely important surfaces?
12. Does every visual element have a purpose?
13. Does the desktop composition feel deliberately designed rather than stretched?
14. Does the mobile composition feel deliberately designed rather than compressed?
15. Does the interface communicate information faster than it communicates decoration?

If any answer is NO, iterate before finalising.

## Golden rule

Do not try to make GetMyMetro look impressive. Make it feel **obvious, fast,
calm, trustworthy, beautiful.** Award-worthy quality emerges from exceptional
information design, typography, spacing, responsive composition, accessibility
and attention to detail — not decoration.

---

# Hard constraints this brief does NOT override

These are legal, data-correctness or runtime rules. They survive any redesign.

1. **Attribution.** "Contains data provided by Kochi Metro Rail Limited" must
   render verbatim, and nothing may imply KMRL endorses this app. OpenStreetMap
   and CARTO attribution must remain visible on the map. Licence conditions,
   not styling.

2. **Never claim liveness.** There is no realtime feed. Train positions are
   scheduled, and the "Scheduled positions… nothing here is measured" copy must
   stay prominent, not shrink into a caption.

3. **The strand facts must survive.** CLAUDE.md finding 9: at 20 weekday
   platforms the final towards-Aluva departure terminates at Muttom, 51–53
   minutes after the last through train. Lead with `lastThrough`; keep
   short-turn labelling on every affected row; keep the holiday caveat. This is
   the copy most likely to be lost in a visual rewrite and the copy that strands
   somebody if it is.

4. **`noscript` holds text only**, never child elements — an element inside one
   is an NG0500 hydration error that builds clean and tests clean.

5. **16px is the floor** for any rendered text. The brief agrees ("Utility:
   16px minimum"); it is restated because Tailwind's small-text utilities are
   deliberately deleted and third-party CSS reintroduces them.

6. **Bundle gate: 150 kB gzipped initial.** Currently 96.28 kB.

## Where this brief changes earlier rules — change them deliberately

- **Motion.** `docs/build-checklist.md` said ≤150ms and zero `@keyframes`. The
  brief allows **150–300ms** and asks for loading skeletons. Relax the rule and
  update the build gate rather than routing around it — but keep everything
  behind `prefers-reduced-motion`, and keep "nothing animates on load".
- **Touch targets.** The checklist said 56px; the brief says ~44–48px minimum.
  56px for primary actions still satisfies both. Do not go below 44px anywhere.
