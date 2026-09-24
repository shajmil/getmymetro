# Draft email to KMRL Open Data

Written in plain language for a non-technical reader, with the exact details
kept in a short section at the end that can be forwarded to a technical
colleague without rewriting anything.

**Status:** the timetable-refresh question has been answered — KMRL confirmed
the existing file's timings are still accurate. This draft is now the
realtime question only.

**To:** opendata@kmrl.co.in
**Cc:** contact@kmrl.co.in (the contact address listed inside the data file)
**Subject:** Does KMRL share live train information with developers?

---

Dear Sir/Madam,

Thank you for confirming that the timings in the published timetable file are
still accurate. That is very helpful, and I will use it as the basis for the
app.

To introduce myself briefly: I am building a free mobile-friendly website to
help Kochi Metro passengers plan journeys — showing train timings, fares, and
advice on when to leave home to reach somewhere on time. I will display the
credit line "Contains data provided by Kochi Metro Rail Limited" as your terms
require, and will make clear that the app is not endorsed by KMRL.

I have one further question.

**Does KMRL share live train information?**

The timetable file tells me when trains are *scheduled* to run. I could not
find anything that shares what is happening on the day itself — for example,
where trains currently are, how many minutes until the next train actually
arrives, or notices about delays and service disruptions.

- Does KMRL share this kind of live information with developers?
- If yes, where can I access it, and is any registration or permission needed?
- If not, is it something KMRL plans to offer in future?

If live information does become available, my app would collect it from your
system just once every few seconds and then share it with all its users. So no
matter how many passengers use the app, KMRL's systems would only ever see a
single connection, not one per passenger.

One small related note, in case it is useful to whoever maintains the file: the
timetable states that it is valid up to 31 December 2025. Since you have
confirmed the timings are still correct, it may be worth updating that date in
a future release — some apps read it strictly and will show passengers no
trains at all for dates beyond it.

Thank you again for making this data publicly available. Having station names
in Malayalam and Hindi included, along with the full fare chart, made it much
easier to build something that works properly for local passengers.

I would be happy to answer any questions, or to show you the app once it is
ready.

Best regards,
Shajmil
v.jshejmil@gmail.com

---

**If you need to pass this to a technical colleague, these are the specifics:**

- Feed in use: https://kochimetro.org/opendata/KMRLOpenData.zip
  (downloaded 22 Sep 2026)
- The question is whether a GTFS-Realtime endpoint exists (VehiclePosition /
  TripUpdate / ServiceAlert), and what access it requires
- The closing note refers to `feed_info.txt` `feed_end_date 20251231` and the
  matching `calendar.txt` service windows (`WK`, `WE`), which cause
  spec-compliant consumers to resolve zero active services for 2026 dates

---

## Notes before sending

- Replace the sign-off with your preferred name; add a project URL once
  something is deployed, as it tends to improve response rates.
- The opening thank-you assumes KMRL's confirmation came by email. If it came
  by phone or in person, reword it to match — and either way, **keep a written
  record of who confirmed it and when** (finding 6 depends on it).
- If no reply in ~2 weeks, the KMRL public contact number is 1800 425 0355
  (from `agency.txt`), and there is an RTI route for a documented answer.
