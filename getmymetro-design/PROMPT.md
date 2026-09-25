# Prompt to paste into Claude Code

Copy everything below the line into Claude Code, from your project folder, after putting this `getmymetro-design/` folder at the root of your repo.

---

Redesign the GetMyMetro app's UI to match the design in `getmymetro-design/`.

Read these first, in this order:

1. `getmymetro-design/DESIGN.md` — the full spec (concept, tokens, type, components, screens, states, accessibility). This is the source of truth.
2. `getmymetro-design/screens/*.png` — look at every screenshot.
3. `getmymetro-design/html/*.html` — static reference markup for exact sizes and spacing. It is a visual reference only: do not copy it into the app; rebuild it as proper components in this project's own framework and conventions.
4. `getmymetro-design/tokens.css` — design tokens.

How to work:

- First, explore the existing codebase and tell me: the framework and styling approach in use, which existing screens/components map to which design screens, and your plan. Wait for my OK before large changes.
- Add the tokens once (global stylesheet / theme) and use them everywhere. No hard-coded colours in components.
- Build the shared components first, then compose screens from them: JourneyLine (vertical line, rows + nodes), JourneySummary, LineTrack (horizontal line), DepartureBoard (two aligned lanes), NetworkStrip, primary/secondary buttons, language switch, search input, alert, skeletons.
- Then the screens: Home, Station board, Route, Choose destination, and all the states (loading, no destination, no service tonight, timetable unavailable, terminal station). Then the desktop layout (12-column; journey left, board right, network strip below).
- Keep all existing data, routing and business logic. Change presentation only unless something blocks the design; if so, ask.
- English and Malayalam must both work. Malayalam rows grow; never fixed heights, never mid-word breaks.
- No dark information panels, no gradients, no shadows, no emoji icons, nothing under 16px.

Done means:

- Every screen matches the screenshots at 390×844 and 1440×900, and still works at 360px wide and at 200% text size.
- Text contrast ≥ 4.5:1, visible focus rings, 44px+ touch targets, real buttons/links/inputs, reduced-motion respected.
- Tabular numerals on every time, countdown, fare and count.
- Run the app, compare each screen side by side with its screenshot, and fix differences before telling me it's done. List anything you couldn't match.
