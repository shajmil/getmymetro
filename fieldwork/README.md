# Station survey — what to record on the ride

This is the data that makes the app hard to copy. Everything else we ship comes
out of KMRL's public feed, so a competitor can reproduce it in a weekend. None
of this is in any open dataset. Once it is collected, it stays ours.

Budget one day. Aluva to Tripunithura and back, getting off at every station.

Two files to fill:

- `station_survey.csv` — 25 rows, one per station. Things that do not depend on
  which way you are travelling.
- `platform_survey.csv` — 50 rows, one per station per direction. Things that
  flip depending on the direction of travel.

Fill them on your phone as you go. Do not trust memory for 50 rows.

---

## platform_survey.csv — fill this while standing on the platform

**`door_side`** — `left` or `right`, **facing the direction the train is
travelling**. Get this the right way round; it is the one field that is
actively harmful if wrong. Check it from inside the train as you pull in, not
from the platform.

**`best_coach`** — `1`, `2` or `3`, counting **from the front of the train in
its direction of travel**. Which coach puts you nearest the stairs, escalator
or lift you would actually use to leave? Coach 1 in the Aluva direction is
coach 3 in the Tripunithura direction, which is exactly why this file has two
rows per station.

**`best_position_in_coach`** — `front`, `middle` or `rear`. Only worth noting
where the coach is long enough that it makes a real difference.

**`exit_used`** — which exit that coach lands you at, matching the labels you
write in `station_survey.csv`.

## station_survey.csv — fill this at the concourse and street level

**`exit_count`, `exit_labels`** — how many street exits, and what they are
called *on the signage* (`A`, `B`, `East`, whatever KMRL actually painted).
Use their words, not ours.

**`exit_landmarks`** — the useful part. What is each exit actually for?
Semicolon-separated, exit first:

```
A: Lulu Mall, bus stand; B: Oberon Mall, NH bypass
```

Name the places people say out loud. "Lulu Mall" is a search term; "commercial
complex" is not.

**`street_to_platform_sec`** — **this one closes a real gap.** Walk it: from
the street entrance, through security, ticket or gate, up to standing on the
platform. Time it with a stopwatch, unhurried, as an ordinary passenger with a
bag.

The leave-by engine currently has no value for this at all (see CLAUDE.md,
gaps in the leave-by engine, item 2). It is guessed at 3–6 minutes and it is
the difference between the app being right and being wrong. Real numbers per
station make the signature feature trustworthy.

**`platform_to_street_sec`** — the reverse, which is usually faster because
there is no security check.

**`security_queue_typical_sec`** — what you actually waited. Note the time of
day in `notes` if it looked unusual; a 9am queue is not a 3pm queue. If you can
manage a second pass at peak for the busy stations (Aluva, Edapally, MG Road,
Vyttila, Tripunithura), do it.

**`has_lift`, `has_escalator`, `step_free_end_to_end`** — `yes` / `no` /
`partial`.

Worth doing properly: the feed claims `wheelchair_boarding = 1` for **all 25
stations**, which tells us nothing. Whether a lift exists, works, and reaches
street level is a different question, and right now nobody in Kochi publishes
a real answer. If your observations differ from the feed, that is a finding,
not a mistake — write what you saw.

---

## Practical notes

- Ride the full line one way, then back. Door side and coach position are
  direction-dependent and you cannot infer the return leg by flipping the
  first — platform layouts are not symmetric.
- Off-peak is easier for measuring walk times; peak is needed for queues.
  If you only get one pass, take off-peak and mark the queue figures
  `unverified`.
- Photograph the exit signage at each station. Cheaper than going back.
- Leave a cell blank rather than guessing. A blank renders as "not known";
  a wrong value renders as confident and wrong, which is worse.
- Keep the receipts. You will want the first-hand record when a station gets
  renovated and the data goes stale.

## After collection

The two CSVs merge into the page data at build time. Fields that are filled
render; fields left blank are omitted rather than shown as unknown.
