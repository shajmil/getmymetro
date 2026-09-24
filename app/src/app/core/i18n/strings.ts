/**
 * Every word the UI says, in both languages.
 *
 * ---------------------------------------------------------------------------
 * THE MALAYALAM IS NOT REVIEWED. IT MUST NOT SHIP WITHOUT A NATIVE SPEAKER
 * READING IT.
 * ---------------------------------------------------------------------------
 *
 * The station names are safe — they come from KMRL's own `translations.txt`
 * and are the operator's spelling, not ours. **Everything else in the `ML`
 * table below was written by a machine**, as was the Malayalam meta copy in
 * `build_pages.py`. Some of it is certainly stiff and some of it may be wrong
 * in ways an English reader cannot see, and the copy it is translating is the
 * copy that stands between a passenger and a 45-minute wait at an empty
 * platform (CLAUDE.md finding 9). Treat this table as a draft for review, not
 * as a deliverable. The English column is the specification.
 *
 * Two things make review tractable rather than a rewrite:
 *
 *   * `ML` is typed as `Record<StringKey, string>`, so a key added to `EN` and
 *     forgotten here is a compile error rather than an English sentence
 *     appearing mid-paragraph on a Malayalam page.
 *   * Every key is listed once, in page order, with the English beside it.
 *
 * **The English strings are lifted verbatim from the Phase 1-5 templates.**
 * The page specs assert rendered text, so a reworded English string is a
 * failing test — which is the intended guard. If one has to change, change it
 * here and in the spec deliberately.
 *
 * Numbers, clock times and fares are **not** translated. The feed's clock
 * format (`5:25 AM`) is what KMRL publishes, what `build_pages.py` writes into
 * the Malayalam meta descriptions, and what Malayalam-language transit
 * signage in Kochi actually uses. Inventing a Malayalam meridiem here would
 * make the page disagree with the platform sign.
 */

/** Interpolation values. `{name}` in a string is replaced by `params.name`. */
export type StringParams = Readonly<Record<string, string | number>>;

/**
 * The English catalogue, and the source of truth for the key set.
 *
 * Grouped by where it appears, in the order a reader meets it.
 */
export const EN = {
  // ------------------------------------------------------------------ shell
  'shell.skip': 'Skip to content',
  'shell.tagline': 'Kochi Metro',
  /** The label of the *other* language, so it reads in the language it offers. */
  'shell.switch': 'മലയാളം',
  'shell.switchTitle': 'Read this page in Malayalam',
  'shell.disclaimer':
    'getmymetro is an independent app. It is not endorsed by, affiliated with, or operated by Kochi Metro Rail Limited.',

  // ----------------------------------------------------------------- common
  'common.tryAgain': 'Try again',
  'common.dataFailed':
    'The timetable could not be loaded. Nothing on this page is guessed, so there is nothing to show until it arrives.',
  'common.loading': 'Loading the timetable — about 7 kB.',
  'common.stop': 'stop',
  'common.stops': 'stops',
  'common.tomorrow': ' tomorrow',
  'common.noDeparturesHere': 'No departures at this station in the timetable we hold.',

  // ------------------------------------------------------------------- line
  'line.diagramLabel': 'Kochi Metro line, {count} stations in order',
  'line.from': 'From',
  'line.to': 'To',
  'line.startsHere': ', journey starts here',
  'line.endsHere': ', journey ends here',
  'line.thisStation': ', this station',

  // -------------------------------------------------------------------- map
  // The heading names what the map answers. The line under it is the honesty
  // rule, at body size and directly beneath the heading rather than under the
  // map: keralam.co's title says "Live Map" and its disclaimer is small grey
  // text below the frame, which is the failure this wording exists to avoid.
  'map.heading': 'Where the trains are now',
  'map.scheduled':
    "Scheduled positions, worked out from KMRL's timetable on your phone. No live tracking is published for this metro, so nothing here is measured.",
  'map.unavailable':
    'The map needs a connection and there is not one, so here is the line as a diagram instead. The times above are worked out on your phone and are unaffected.',
  'map.loading': 'Loading the map.',
  'map.wholeLine': 'Whole line',
  'map.backTo': 'Back to {station}',
  'map.running': '{count} trains are running now.',
  'map.runningOne': 'One train is running now.',
  'map.noneRunning': 'No trains are running now.',
  'map.legend':
    'Circles are stations — tap one for its times. Arrows are trains, pointing the way they are travelling. An arrow with a bar across the front stops before the end of the line.',
  'map.creditLead': 'Map data:',
  'map.allStations': 'All {count} stations on the line',
  'map.allStationsBody':
    'Every station has its own page: the first train, the last train that actually gets you there, and the fare to everywhere else.',

  // ------------------------------------------------------------------ board
  'board.towards': 'Towards {name}',
  'board.servesFor': 'for {names}',
  'board.servesMore': ' and {count} more',
  'board.servesAll': 'All {count} stations this way',
  'board.noDepartures': 'No departures from this platform in the timetable we hold.',
  'board.then': 'then {clock}',
  'board.shortTurn': 'Only as far as {terminus} — this train does not reach {misses}.',
  'board.nudge': 'Run — {next} min, then a {gap} min wait.',
  'board.lastHeading': 'Last train towards {name}',
  'board.throughGone': 'Gone — it left at {clock}',
  'board.throughGoneBody': 'That was the last train all the way to {terminus}.',
  'board.inTime': '{clock} — in {remaining}',
  'board.throughBody': 'That is the last train all the way to {terminus}.',
  'board.laterShort': 'A later train leaves at {clock}, but it stops at {terminus}.',
  'board.lastIsNext': 'This is the next train, and the last one.',
  'board.lastShortTurn': 'It only runs as far as {terminus}.',
  'board.cliff':
    'Nothing leaves this platform between {previous} and {clock} — a {minutes} minute gap.',

  // ------------------------------------------------------------------- home
  'home.heading': 'Kochi Metro — know when to leave',
  'home.fixAt': 'Nearest station — {distance} from you.',
  'home.fixNear': 'Nearest station — {distance} away.',
  'home.fixFar':
    'You are {distance} from the metro line. These are the times at {station}, the closest station. Choose another below if you need one.',
  'home.fixVague':
    'Your location is only accurate to about {accuracy} m, so this may be the wrong station. Choose the right one below if it is.',
  'home.remembered': 'The station you last used.',
  'home.picked': 'The station you chose.',
  'home.locating': 'Finding your nearest station. Or choose one below.',
  'home.chooseBelow': 'Choose your station below to see the next departures.',
  'home.denied':
    "Location is turned off for this site, so the station below is the one you last used. You can turn it back on in your browser's site settings — or just choose a station, which works the same.",
  'home.unsupported':
    'This browser will not share your location. Choose a station and it will be remembered.',
  'home.timedOut': 'Finding your location took too long.',
  'home.noFix': 'Your device could not work out where it is.',
  'home.chooseOrRetry': 'Choose a station below, or try again.',
  'home.retryLocation': 'Try location again',
  'home.waiting': 'Waiting for the timetable.',
  'home.allFrom': 'All departures and fares from {station}',
  'home.journeyHeading': 'Going somewhere else?',
  'home.whereTo': 'Where are you going? — fares and times',
  'home.whereToBody':
    'Pick where you are going for the fare, how long it takes and the next trains on that platform.',
  'home.whereToWaiting': 'Choose your station first, then pick where you are going.',
  'home.destinationCost': '₹{fare} · {hops} {stopWord}',
  'home.firstLast': 'First and last train from {station}',
  'home.choosePicker': 'Choose your station',
  'home.changeStation': 'Change station',
  'home.showing': 'showing',
  'home.listLoading': 'The station list is still loading.',
  'home.noscript':
    'Departure times need JavaScript, because they are worked out against your clock as you read them rather than fixed when this page was built. The station list above is complete and correct without it.',

  // ---------------------------------------------------------------- station
  'station.notFoundHeading': 'No station with that name',
  'station.notFoundBody':
    'The Kochi Metro has {count} stations and none of them is "{slug}". Every one of them is on the line below — tap the one you want.',
  'station.backHome': 'Back to next departures',
  'station.fallbackName': 'Station',
  'station.position': 'Station {index} of {count} on the line',
  'station.firstLastHeading': 'First and last train towards {name}',
  'station.firstTrain': 'First train',
  'station.lastThrough': 'Last train all the way to {name}',
  'station.lastFromPlatform': 'Last train from this platform',
  'station.lastFromPlatformValue': '{clock}, only as far as {terminus}',
  'station.trainsADay': 'Trains a day',
  'station.strand':
    'The {last} leaves {minutes} minutes later but stops at {terminus}. If you are going past there, the {through} is the last train you can take.',
  'station.cliff':
    "Nothing leaves this platform for {minutes} minutes before the {clock}. Trains run every few minutes until then, so missing one late in the evening costs far more than missing one at six o'clock.",
  'station.faresHeading': 'Fares towards {name}',
  'station.faresBody': '{count} stations from this platform. Tap one for its times.',
  'station.noscript':
    'Departure times need JavaScript, because they are worked out against your clock as you read them rather than fixed when this page was built.',

  // ------------------------------------------------------------------ route
  'route.sameHeading': '{name} to {name}',
  'route.sameBody':
    'That is the same station at both ends, so there is no journey to price. Pick somewhere else to travel to.',
  'route.timesAt': 'Times and fares at {name}',
  'route.unknownHeading': 'No journey with that name',
  'route.unknownLead': '"{pair}" does not name two Kochi Metro stations. Routes look like',
  'route.unknownTail':
    '. Every station is on the line below — tap one to see its times and its fare to everywhere else.',
  'route.heading': '{origin} to {destination}',
  'route.summary': 'Platform towards {towards} · {hops} {stopWord} · ₹{fare}',
  'route.nextTrains': 'Next trains',
  'route.noTrain': 'No train runs from {origin} to {destination} in the timetable we hold.',
  'route.leaves': 'Leaves {clock}',
  'route.arrives': ', arrives {clock}',
  'route.arriving': ', arriving {clock}',
  'route.minutesOnTrain': '{minutes} minutes on the train',
  'route.ridingNote':
    'Riding time only. It does not include getting to the platform, the security check or the queue for a ticket.',
  'route.fareHeading': 'Fare',
  'route.fareBody':
    "KMRL's published fare for {origin} to {destination}, one way. The same in both directions.",
  'route.firstLastHeading': 'First and last train',
  'route.lastReaches': 'Last train that reaches {name}',
  'route.timeOnTrain': 'Time on the train',
  'route.minutesExact': '{minutes} minutes',
  'route.minutesRange': '{fastest} to {slowest} minutes',
  'route.strand':
    'A train does leave this platform at {clock}, {minutes} minutes later, but it stops before {destination}. The {last} is the last one that gets you there.',
  'route.onTheWayHeading': 'Stations on the way',
  'route.nextStation': '{destination} is the next station. No stops in between.',
  'route.between': '{count} between {origin} and {destination}, in order.',
  'route.relatedHeading': 'Related',
  'route.allTimesAt': 'All times at {name}',
  'route.noscript':
    'Departure times need JavaScript, because they are worked out against your clock as you read them rather than fixed when this page was built. The fare, the stops and the first and last train are correct without it.',

  // ------------------------------------------------------- structured data
  /**
   * The `FAQPage` questions, generated from the feed for every one of the
   * 1,250 pages. Theirs is a bare `WebSite` object (CLAUDE.md finding 8).
   *
   * The last-train answer leads with the train that **arrives**, exactly as
   * the page does. A rich result that advertises the 11:44 PM from MG Road
   * would strand the reader before they ever opened the page, and it would do
   * it inside a Google result panel where nothing can correct it.
   */
  'faq.item': '{days}: {clock}.',
  'faq.stationFirstQ': 'When is the first train from {name} towards {towards}?',
  'faq.stationFirstA': 'First train from {name} towards {towards} — {list}',
  'faq.stationLastQ': 'When is the last train from {name} towards {towards}?',
  'faq.stationLastAThrough':
    '{days}: the last train all the way to {towards} leaves {name} at {through}. A later train at {last} only runs as far as {terminus}.',
  'faq.stationLastAPlain': '{days}: the last train towards {towards} leaves {name} at {last}.',
  'faq.routeFirstQ': 'When is the first metro from {origin} to {destination}?',
  'faq.routeFirstA': 'First metro from {origin} to {destination} — {list}',
  'faq.routeLastQ': 'When is the last metro from {origin} to {destination}?',
  'faq.routeLastA':
    '{days}: the last train that reaches {destination} leaves {origin} at {clock}.',
  'faq.routeLastStrand':
    ' A train leaves {minutes} minutes later, at {platformClock}, but it stops before {destination}.',
  'faq.fareQ': 'How much is the Kochi Metro fare from {origin} to {destination}?',
  'faq.fareA':
    "KMRL's published fare from {origin} to {destination} is ₹{fare} one way, the same in both directions. It is {hops} stations and about {minutes} minutes on the train.",

  // --------------------------------------------------------- document title
  /**
   * Kept byte-identical to `build_pages.py`'s `COPY` block.
   *
   * The prerendered `<title>` comes from `pages.json`, which that script
   * writes. These exist so a *client-side* navigation puts the same title in
   * the tab, rather than the app shipping 1,250 titles to every reader to
   * achieve the same thing. If one side changes, change both — the build gate
   * compares a sample.
   */
  'meta.homeTitle': 'getmymetro — Kochi Metro times',
  'meta.homeDescription':
    'Kochi Metro departure times, fares and last-train warnings for all 25 stations. Know when to leave, not just where the train is. Works offline.',
  'meta.stationTitle': '{name} Metro Station - Timings, First & Last Train',
  'meta.routeTitle': '{origin} to {destination} Metro - Timings & Fare Rs {fare}',

  // -------------------------------------------------------------- provenance
  'prov.scheduled': "Scheduled times from KMRL's published timetable — not live.",
  'prov.confirmed': 'KMRL confirmed these timings are current in {month}.',

  // ----------------------------------------------------------------- booking
  'booking.heading': 'Tickets',
  'booking.body':
    'KMRL sells tickets over WhatsApp on their own number. This link opens that chat with "Book Ticket" ready to send — you press send yourself.',
  'booking.cta': 'Book on WhatsApp',
  'booking.note':
    "It does not carry your journey with it, so tell the bot where you are going. Booking is KMRL's service and happens entirely in WhatsApp; getmymetro does not sell tickets, take payment, or see anything you send.",

  // ------------------------------------------------------------- day service
  'caveat.holidayHeading': 'Holiday timetable',
  'caveat.holidayBody':
    'Today is {names}. KMRL runs the Sunday timetable, and these are the Sunday times.',
  'caveat.unknownHeading': 'If today is a public holiday',
  'caveat.unknownBody':
    "These are KMRL's Monday-to-Saturday times. On a public holiday the Sunday timetable runs instead, and it starts about 90 minutes later. KMRL publishes no list of holiday dates, so we cannot check today for you.",

  // -------------------------------------------------------------------- time
  /** `formatWait` output, localised. English matches `core/engine/clock.ts` exactly. */
  'time.due': 'Due',
  'time.minutes': '{minutes} min',
  'time.hours': '{hours} h',
  'time.hoursMinutes': '{hours} h {minutes} min',
  'time.metres': '{metres} m',
  'time.kilometres': '{kilometres} km',

  // -------------------------------------------------------------------- days
  'day.1': 'Monday',
  'day.2': 'Tuesday',
  'day.3': 'Wednesday',
  'day.4': 'Thursday',
  'day.5': 'Friday',
  'day.6': 'Saturday',
  'day.7': 'Sunday',
  'day.every': 'Every day',
  'day.none': 'no days',
  'day.range': '{first} to {last}',

  // ------------------------------------------------------------------ months
  'month.1': 'January',
  'month.2': 'February',
  'month.3': 'March',
  'month.4': 'April',
  'month.5': 'May',
  'month.6': 'June',
  'month.7': 'July',
  'month.8': 'August',
  'month.9': 'September',
  'month.10': 'October',
  'month.11': 'November',
  'month.12': 'December',
} as const;

export type StringKey = keyof typeof EN;

/**
 * The Malayalam catalogue. **Machine-written. Not reviewed. See the header.**
 *
 * Where a sentence resisted a natural translation the English structure has
 * been kept rather than a meaning invented, because a mistranslated
 * last-train warning is worse than a stilted one. Those are the lines a
 * reviewer should look at first.
 */
export const ML: Readonly<Record<StringKey, string>> = {
  // ------------------------------------------------------------------ shell
  'shell.skip': 'ഉള്ളടക്കത്തിലേക്ക് പോകുക',
  'shell.tagline': 'കൊച്ചി മെട്രോ',
  'shell.switch': 'English',
  'shell.switchTitle': 'ഈ പേജ് ഇംഗ്ലീഷിൽ വായിക്കുക',
  'shell.disclaimer':
    'getmymetro ഒരു സ്വതന്ത്ര ആപ്പാണ്. ഇത് കൊച്ചി മെട്രോ റെയിൽ ലിമിറ്റഡിന്റെ അംഗീകാരമുള്ളതോ അവരുമായി ബന്ധപ്പെട്ടതോ അവർ നടത്തുന്നതോ അല്ല.',

  // ----------------------------------------------------------------- common
  'common.tryAgain': 'വീണ്ടും ശ്രമിക്കുക',
  'common.dataFailed':
    'സമയവിവരപ്പട്ടിക ലഭ്യമാക്കാൻ കഴിഞ്ഞില്ല. ഈ പേജിലെ ഒന്നും ഊഹിച്ചെടുത്തതല്ല, അതിനാൽ അത് എത്തുന്നതുവരെ കാണിക്കാൻ ഒന്നുമില്ല.',
  'common.loading': 'സമയവിവരപ്പട്ടിക ലഭ്യമാക്കുന്നു — ഏകദേശം 7 kB.',
  'common.stop': 'സ്റ്റേഷൻ',
  'common.stops': 'സ്റ്റേഷനുകൾ',
  'common.tomorrow': ' നാളെ',
  'common.noDeparturesHere':
    'ഞങ്ങളുടെ പക്കലുള്ള സമയവിവരപ്പട്ടികയിൽ ഈ സ്റ്റേഷനിൽ നിന്ന് ട്രെയിനുകളൊന്നുമില്ല.',

  // ------------------------------------------------------------------- line
  'line.diagramLabel': 'കൊച്ചി മെട്രോ ലൈൻ, ക്രമത്തിൽ {count} സ്റ്റേഷനുകൾ',
  'line.from': 'നിന്ന്',
  'line.to': 'വരെ',
  'line.startsHere': ', യാത്ര ഇവിടെ തുടങ്ങുന്നു',
  'line.endsHere': ', യാത്ര ഇവിടെ അവസാനിക്കുന്നു',
  'line.thisStation': ', ഈ സ്റ്റേഷൻ',

  // -------------------------------------------------------------------- map
  'map.heading': 'ട്രെയിനുകൾ ഇപ്പോൾ എവിടെയാണ്',
  'map.scheduled':
    'KMRL-ന്റെ സമയവിവരപ്പട്ടികയിൽ നിന്ന് നിങ്ങളുടെ ഫോണിൽ കണക്കാക്കിയ സ്ഥാനങ്ങൾ. ഈ മെട്രോയ്ക്ക് തത്സമയ ട്രാക്കിംഗ് പ്രസിദ്ധീകരിക്കുന്നില്ല, അതിനാൽ ഇവിടെ ഒന്നും അളന്നതല്ല.',
  'map.unavailable':
    'മാപ്പിന് ഇന്റർനെറ്റ് വേണം, അത് ഇപ്പോൾ ഇല്ല. അതിനാൽ ലൈൻ ഒരു ചിത്രമായി താഴെ കാണിക്കുന്നു. മുകളിലുള്ള സമയങ്ങൾ നിങ്ങളുടെ ഫോണിൽ തന്നെ കണക്കാക്കുന്നതിനാൽ അവയ്ക്ക് മാറ്റമില്ല.',
  'map.loading': 'മാപ്പ് ലഭ്യമാക്കുന്നു.',
  'map.wholeLine': 'ലൈൻ മുഴുവൻ',
  'map.backTo': '{station}-ലേക്ക് മടങ്ങുക',
  'map.running': 'ഇപ്പോൾ {count} ട്രെയിനുകൾ ഓടുന്നു.',
  'map.runningOne': 'ഇപ്പോൾ ഒരു ട്രെയിൻ ഓടുന്നു.',
  'map.noneRunning': 'ഇപ്പോൾ ട്രെയിനുകളൊന്നും ഓടുന്നില്ല.',
  'map.legend':
    'വൃത്തങ്ങൾ സ്റ്റേഷനുകളാണ് — സമയം കാണാൻ ഒന്നിൽ ടാപ്പ് ചെയ്യുക. അമ്പടയാളങ്ങൾ ട്രെയിനുകളാണ്, അവ പോകുന്ന ദിശയിലേക്കാണ് ചൂണ്ടുന്നത്. മുന്നിൽ ഒരു വരയുള്ള അമ്പടയാളം ലൈനിന്റെ അറ്റം വരെ പോകാത്ത ട്രെയിനാണ്.',
  'map.creditLead': 'മാപ്പ് ഡാറ്റ:',
  'map.allStations': 'ലൈനിലെ {count} സ്റ്റേഷനുകളും',
  'map.allStationsBody':
    'ഓരോ സ്റ്റേഷനും അതിന്റേതായ പേജുണ്ട്: ആദ്യ ട്രെയിൻ, നിങ്ങളെ ശരിക്കും എത്തിക്കുന്ന അവസാന ട്രെയിൻ, മറ്റെല്ലായിടത്തേക്കുമുള്ള നിരക്ക്.',

  // ------------------------------------------------------------------ board
  'board.towards': '{name} ഭാഗത്തേക്ക്',
  'board.servesFor': '{names} എന്നിവയ്ക്ക്',
  'board.servesMore': ' കൂടാതെ {count} എണ്ണം കൂടി',
  'board.servesAll': 'ഈ ഭാഗത്തേക്കുള്ള {count} സ്റ്റേഷനുകളും',
  'board.noDepartures':
    'ഞങ്ങളുടെ പക്കലുള്ള സമയവിവരപ്പട്ടികയിൽ ഈ പ്ലാറ്റ്ഫോമിൽ നിന്ന് ട്രെയിനുകളൊന്നുമില്ല.',
  'board.then': 'പിന്നെ {clock}',
  'board.shortTurn': '{terminus} വരെ മാത്രം — ഈ ട്രെയിൻ {misses} വരെ പോകില്ല.',
  'board.nudge': 'ഓടുക — {next} മിനിറ്റ്, പിന്നെ {gap} മിനിറ്റ് കാത്തിരിപ്പ്.',
  'board.lastHeading': '{name} ഭാഗത്തേക്കുള്ള അവസാന ട്രെയിൻ',
  'board.throughGone': 'പോയി — {clock}-ന് പുറപ്പെട്ടു',
  'board.throughGoneBody': '{terminus} വരെ പോകുന്ന അവസാന ട്രെയിൻ അതായിരുന്നു.',
  'board.inTime': '{clock} — {remaining} കഴിഞ്ഞ്',
  'board.throughBody': '{terminus} വരെ പോകുന്ന അവസാന ട്രെയിൻ അതാണ്.',
  'board.laterShort': '{clock}-ന് പിന്നീട് ഒരു ട്രെയിൻ ഉണ്ട്, പക്ഷേ അത് {terminus}-ൽ നിൽക്കും.',
  'board.lastIsNext': 'ഇതാണ് അടുത്ത ട്രെയിൻ, ഇതുതന്നെയാണ് അവസാനത്തേതും.',
  'board.lastShortTurn': 'ഇത് {terminus} വരെ മാത്രമേ പോകൂ.',
  'board.cliff':
    '{previous}-നും {clock}-നും ഇടയിൽ ഈ പ്ലാറ്റ്ഫോമിൽ നിന്ന് ട്രെയിനില്ല — {minutes} മിനിറ്റ് ഇടവേള.',

  // ------------------------------------------------------------------- home
  'home.heading': 'കൊച്ചി മെട്രോ — എപ്പോൾ ഇറങ്ങണമെന്ന് അറിയുക',
  'home.fixAt': 'അടുത്തുള്ള സ്റ്റേഷൻ — നിങ്ങളിൽ നിന്ന് {distance}.',
  'home.fixNear': 'അടുത്തുള്ള സ്റ്റേഷൻ — {distance} അകലെ.',
  'home.fixFar':
    'നിങ്ങൾ മെട്രോ ലൈനിൽ നിന്ന് {distance} അകലെയാണ്. ഏറ്റവും അടുത്തുള്ള സ്റ്റേഷനായ {station}-ലെ സമയങ്ങളാണിവ. വേണമെങ്കിൽ താഴെ നിന്ന് മറ്റൊന്ന് തിരഞ്ഞെടുക്കുക.',
  'home.fixVague':
    'നിങ്ങളുടെ സ്ഥാനം ഏകദേശം {accuracy} മീറ്റർ കൃത്യത മാത്രമുള്ളതാണ്, അതിനാൽ ഇത് തെറ്റായ സ്റ്റേഷനാകാം. അങ്ങനെയെങ്കിൽ താഴെ നിന്ന് ശരിയായത് തിരഞ്ഞെടുക്കുക.',
  'home.remembered': 'നിങ്ങൾ അവസാനം ഉപയോഗിച്ച സ്റ്റേഷൻ.',
  'home.picked': 'നിങ്ങൾ തിരഞ്ഞെടുത്ത സ്റ്റേഷൻ.',
  'home.locating': 'നിങ്ങളുടെ അടുത്തുള്ള സ്റ്റേഷൻ കണ്ടെത്തുന്നു. അല്ലെങ്കിൽ താഴെ നിന്ന് ഒന്ന് തിരഞ്ഞെടുക്കുക.',
  'home.chooseBelow': 'അടുത്ത ട്രെയിനുകൾ കാണാൻ താഴെ നിങ്ങളുടെ സ്റ്റേഷൻ തിരഞ്ഞെടുക്കുക.',
  'home.denied':
    'ഈ സൈറ്റിന് സ്ഥാനവിവരം ഓഫാക്കിയിരിക്കുന്നു, അതിനാൽ താഴെ കാണുന്നത് നിങ്ങൾ അവസാനം ഉപയോഗിച്ച സ്റ്റേഷനാണ്. ബ്രൗസറിന്റെ സൈറ്റ് ക്രമീകരണങ്ങളിൽ നിന്ന് അത് വീണ്ടും ഓണാക്കാം — അല്ലെങ്കിൽ ഒരു സ്റ്റേഷൻ തിരഞ്ഞെടുത്താലും മതി.',
  'home.unsupported':
    'ഈ ബ്രൗസർ നിങ്ങളുടെ സ്ഥാനം പങ്കിടില്ല. ഒരു സ്റ്റേഷൻ തിരഞ്ഞെടുക്കുക, അത് ഓർത്തുവയ്ക്കും.',
  'home.timedOut': 'നിങ്ങളുടെ സ്ഥാനം കണ്ടെത്താൻ വളരെയധികം സമയമെടുത്തു.',
  'home.noFix': 'നിങ്ങളുടെ ഉപകരണത്തിന് അതിന്റെ സ്ഥാനം കണ്ടെത്താനായില്ല.',
  'home.chooseOrRetry': 'താഴെ ഒരു സ്റ്റേഷൻ തിരഞ്ഞെടുക്കുക, അല്ലെങ്കിൽ വീണ്ടും ശ്രമിക്കുക.',
  'home.retryLocation': 'സ്ഥാനം വീണ്ടും കണ്ടെത്തുക',
  'home.waiting': 'സമയവിവരപ്പട്ടികയ്ക്കായി കാത്തിരിക്കുന്നു.',
  'home.allFrom': '{station}-ൽ നിന്നുള്ള എല്ലാ ട്രെയിനുകളും നിരക്കുകളും',
  'home.journeyHeading': 'മറ്റെവിടെയെങ്കിലും പോകുന്നുണ്ടോ?',
  'home.whereTo': 'എവിടേക്കാണ് പോകുന്നത്? — നിരക്കും സമയവും',
  'home.whereToBody':
    'നിരക്ക്, എത്ര സമയമെടുക്കും, ആ പ്ലാറ്റ്ഫോമിലെ അടുത്ത ട്രെയിനുകൾ എന്നിവ കാണാൻ പോകേണ്ട സ്ഥലം തിരഞ്ഞെടുക്കുക.',
  'home.whereToWaiting': 'ആദ്യം നിങ്ങളുടെ സ്റ്റേഷൻ തിരഞ്ഞെടുക്കുക, പിന്നെ എവിടേക്കാണ് പോകുന്നതെന്ന് തിരഞ്ഞെടുക്കുക.',
  'home.destinationCost': '₹{fare} · {hops} {stopWord}',
  'home.firstLast': '{station}-ൽ നിന്നുള്ള ആദ്യ, അവസാന ട്രെയിൻ',
  'home.choosePicker': 'നിങ്ങളുടെ സ്റ്റേഷൻ തിരഞ്ഞെടുക്കുക',
  'home.changeStation': 'സ്റ്റേഷൻ മാറ്റുക',
  'home.showing': 'കാണിക്കുന്നു',
  'home.listLoading': 'സ്റ്റേഷൻ പട്ടിക ഇപ്പോഴും ലഭ്യമാക്കുന്നു.',
  'home.noscript':
    'ട്രെയിൻ സമയങ്ങൾക്ക് JavaScript ആവശ്യമാണ്, കാരണം ഈ പേജ് തയ്യാറാക്കിയ സമയത്തല്ല, നിങ്ങൾ വായിക്കുന്ന നിമിഷത്തിൽ നിങ്ങളുടെ ക്ലോക്ക് അനുസരിച്ചാണ് അവ കണക്കാക്കുന്നത്. മുകളിലുള്ള സ്റ്റേഷൻ പട്ടിക അതില്ലാതെയും പൂർണ്ണവും ശരിയുമാണ്.',

  // ---------------------------------------------------------------- station
  'station.notFoundHeading': 'ആ പേരിൽ ഒരു സ്റ്റേഷനില്ല',
  'station.notFoundBody':
    'കൊച്ചി മെട്രോയിൽ {count} സ്റ്റേഷനുകളുണ്ട്, അതിലൊന്നും "{slug}" അല്ല. അവയെല്ലാം താഴെയുള്ള ലൈനിലുണ്ട് — വേണ്ടത് ടാപ്പ് ചെയ്യുക.',
  'station.backHome': 'അടുത്ത ട്രെയിനുകളിലേക്ക് മടങ്ങുക',
  'station.fallbackName': 'സ്റ്റേഷൻ',
  'station.position': 'ലൈനിലെ {count}-ൽ {index}-ാമത്തെ സ്റ്റേഷൻ',
  'station.firstLastHeading': '{name} ഭാഗത്തേക്കുള്ള ആദ്യ, അവസാന ട്രെയിൻ',
  'station.firstTrain': 'ആദ്യ ട്രെയിൻ',
  'station.lastThrough': '{name} വരെ പോകുന്ന അവസാന ട്രെയിൻ',
  'station.lastFromPlatform': 'ഈ പ്ലാറ്റ്ഫോമിൽ നിന്നുള്ള അവസാന ട്രെയിൻ',
  'station.lastFromPlatformValue': '{clock}, {terminus} വരെ മാത്രം',
  'station.trainsADay': 'പ്രതിദിനം ട്രെയിനുകൾ',
  'station.strand':
    '{last} ട്രെയിൻ {minutes} മിനിറ്റ് കഴിഞ്ഞ് പുറപ്പെടുമെങ്കിലും {terminus}-ൽ നിൽക്കും. അതിനപ്പുറം പോകുന്നെങ്കിൽ {through} ആണ് നിങ്ങൾക്ക് പിടിക്കാവുന്ന അവസാന ട്രെയിൻ.',
  'station.cliff':
    '{clock} ട്രെയിനിന് മുൻപ് {minutes} മിനിറ്റ് ഈ പ്ലാറ്റ്ഫോമിൽ നിന്ന് ഒന്നും പുറപ്പെടില്ല. അതുവരെ ഏതാനും മിനിറ്റ് ഇടവിട്ട് ട്രെയിനുകളുണ്ട്, അതിനാൽ രാത്രി വൈകി ഒരെണ്ണം നഷ്ടപ്പെടുന്നത് ആറുമണിക്ക് ഒരെണ്ണം നഷ്ടപ്പെടുന്നതിനേക്കാൾ വളരെ വിലപിടിപ്പുള്ളതാണ്.',
  'station.faresHeading': '{name} ഭാഗത്തേക്കുള്ള നിരക്കുകൾ',
  'station.faresBody':
    'ഈ പ്ലാറ്റ്ഫോമിൽ നിന്ന് {count} സ്റ്റേഷനുകൾ. സമയം കാണാൻ ഒന്നിൽ ടാപ്പ് ചെയ്യുക.',
  'station.noscript':
    'ട്രെയിൻ സമയങ്ങൾക്ക് JavaScript ആവശ്യമാണ്, കാരണം ഈ പേജ് തയ്യാറാക്കിയ സമയത്തല്ല, നിങ്ങൾ വായിക്കുന്ന നിമിഷത്തിൽ നിങ്ങളുടെ ക്ലോക്ക് അനുസരിച്ചാണ് അവ കണക്കാക്കുന്നത്.',

  // ------------------------------------------------------------------ route
  'route.sameHeading': '{name} മുതൽ {name} വരെ',
  'route.sameBody':
    'രണ്ടറ്റത്തും ഒരേ സ്റ്റേഷനാണ്, അതിനാൽ നിരക്ക് പറയാൻ ഒരു യാത്രയില്ല. യാത്ര ചെയ്യാൻ മറ്റൊരിടം തിരഞ്ഞെടുക്കുക.',
  'route.timesAt': '{name}-ലെ സമയവും നിരക്കും',
  'route.unknownHeading': 'ആ പേരിൽ ഒരു യാത്രയില്ല',
  'route.unknownLead': '"{pair}" രണ്ട് കൊച്ചി മെട്രോ സ്റ്റേഷനുകളെ സൂചിപ്പിക്കുന്നില്ല. റൂട്ടുകൾ ഇങ്ങനെയാണ്',
  'route.unknownTail':
    '. എല്ലാ സ്റ്റേഷനുകളും താഴെയുള്ള ലൈനിലുണ്ട് — സമയവും മറ്റെല്ലായിടത്തേക്കുമുള്ള നിരക്കും കാണാൻ ഒന്നിൽ ടാപ്പ് ചെയ്യുക.',
  'route.heading': '{origin} മുതൽ {destination} വരെ',
  'route.summary': '{towards} ഭാഗത്തേക്കുള്ള പ്ലാറ്റ്ഫോം · {hops} {stopWord} · ₹{fare}',
  'route.nextTrains': 'അടുത്ത ട്രെയിനുകൾ',
  'route.noTrain':
    'ഞങ്ങളുടെ പക്കലുള്ള സമയവിവരപ്പട്ടികയിൽ {origin} മുതൽ {destination} വരെ ട്രെയിനില്ല.',
  'route.leaves': '{clock}-ന് പുറപ്പെടുന്നു',
  'route.arrives': ', {clock}-ന് എത്തുന്നു',
  'route.arriving': ', {clock}-ന് എത്തും',
  'route.minutesOnTrain': 'ട്രെയിനിൽ {minutes} മിനിറ്റ്',
  'route.ridingNote':
    'യാത്രാസമയം മാത്രം. പ്ലാറ്റ്ഫോമിൽ എത്താനുള്ള സമയം, സുരക്ഷാ പരിശോധന, ടിക്കറ്റ് വരി എന്നിവ ഇതിൽ ഉൾപ്പെടില്ല.',
  'route.fareHeading': 'നിരക്ക്',
  'route.fareBody':
    '{origin} മുതൽ {destination} വരെ ഒരു വശത്തേക്കുള്ള KMRL പ്രസിദ്ധീകരിച്ച നിരക്ക്. രണ്ട് ദിശയിലും ഒരുപോലെ.',
  'route.firstLastHeading': 'ആദ്യ, അവസാന ട്രെയിൻ',
  'route.lastReaches': '{name}-ൽ എത്തുന്ന അവസാന ട്രെയിൻ',
  'route.timeOnTrain': 'ട്രെയിനിലെ സമയം',
  'route.minutesExact': '{minutes} മിനിറ്റ്',
  'route.minutesRange': '{fastest} മുതൽ {slowest} വരെ മിനിറ്റ്',
  'route.strand':
    '{clock}-ന് ഈ പ്ലാറ്റ്ഫോമിൽ നിന്ന് {minutes} മിനിറ്റ് കഴിഞ്ഞ് ഒരു ട്രെയിൻ പുറപ്പെടുന്നുണ്ട്, പക്ഷേ അത് {destination}-ന് മുൻപ് നിൽക്കും. {last} ആണ് നിങ്ങളെ അവിടെ എത്തിക്കുന്ന അവസാനത്തേത്.',
  'route.onTheWayHeading': 'വഴിയിലുള്ള സ്റ്റേഷനുകൾ',
  'route.nextStation': '{destination} ആണ് അടുത്ത സ്റ്റേഷൻ. ഇടയിൽ സ്റ്റോപ്പുകളില്ല.',
  'route.between': '{origin}-നും {destination}-നും ഇടയിൽ {count} എണ്ണം, ക്രമത്തിൽ.',
  'route.relatedHeading': 'ബന്ധപ്പെട്ടവ',
  'route.allTimesAt': '{name}-ലെ എല്ലാ സമയങ്ങളും',
  'route.noscript':
    'ട്രെയിൻ സമയങ്ങൾക്ക് JavaScript ആവശ്യമാണ്, കാരണം ഈ പേജ് തയ്യാറാക്കിയ സമയത്തല്ല, നിങ്ങൾ വായിക്കുന്ന നിമിഷത്തിൽ നിങ്ങളുടെ ക്ലോക്ക് അനുസരിച്ചാണ് അവ കണക്കാക്കുന്നത്. നിരക്ക്, സ്റ്റേഷനുകൾ, ആദ്യ, അവസാന ട്രെയിൻ എന്നിവ അതില്ലാതെയും ശരിയാണ്.',

  // ------------------------------------------------------- structured data
  'faq.item': '{days}: {clock}.',
  'faq.stationFirstQ': '{name}-ൽ നിന്ന് {towards} ഭാഗത്തേക്കുള്ള ആദ്യ ട്രെയിൻ എപ്പോഴാണ്?',
  'faq.stationFirstA': '{name}-ൽ നിന്ന് {towards} ഭാഗത്തേക്കുള്ള ആദ്യ ട്രെയിൻ — {list}',
  'faq.stationLastQ': '{name}-ൽ നിന്ന് {towards} ഭാഗത്തേക്കുള്ള അവസാന ട്രെയിൻ എപ്പോഴാണ്?',
  'faq.stationLastAThrough':
    '{days}: {towards} വരെ പോകുന്ന അവസാന ട്രെയിൻ {name}-ൽ നിന്ന് {through}-ന് പുറപ്പെടും. {last}-ന് പിന്നീടൊരു ട്രെയിൻ ഉണ്ടെങ്കിലും അത് {terminus} വരെ മാത്രമേ പോകൂ.',
  'faq.stationLastAPlain':
    '{days}: {towards} ഭാഗത്തേക്കുള്ള അവസാന ട്രെയിൻ {name}-ൽ നിന്ന് {last}-ന് പുറപ്പെടും.',
  'faq.routeFirstQ': '{origin} മുതൽ {destination} വരെയുള്ള ആദ്യ മെട്രോ എപ്പോഴാണ്?',
  'faq.routeFirstA': '{origin} മുതൽ {destination} വരെയുള്ള ആദ്യ മെട്രോ — {list}',
  'faq.routeLastQ': '{origin} മുതൽ {destination} വരെയുള്ള അവസാന മെട്രോ എപ്പോഴാണ്?',
  'faq.routeLastA':
    '{days}: {destination}-ൽ എത്തുന്ന അവസാന ട്രെയിൻ {origin}-ൽ നിന്ന് {clock}-ന് പുറപ്പെടും.',
  'faq.routeLastStrand':
    ' {minutes} മിനിറ്റ് കഴിഞ്ഞ് {platformClock}-ന് ഒരു ട്രെയിൻ പുറപ്പെടുന്നുണ്ട്, പക്ഷേ അത് {destination}-ന് മുൻപ് നിൽക്കും.',
  'faq.fareQ': '{origin} മുതൽ {destination} വരെയുള്ള കൊച്ചി മെട്രോ നിരക്ക് എത്രയാണ്?',
  'faq.fareA':
    '{origin} മുതൽ {destination} വരെ KMRL പ്രസിദ്ധീകരിച്ച നിരക്ക് ഒരു വശത്തേക്ക് ₹{fare} ആണ്, രണ്ട് ദിശയിലും ഒരുപോലെ. ഇത് {hops} സ്റ്റേഷനുകളും ട്രെയിനിൽ ഏകദേശം {minutes} മിനിറ്റുമാണ്.',

  // --------------------------------------------------------- document title
  'meta.homeTitle': 'getmymetro — കൊച്ചി മെട്രോ സമയം',
  'meta.homeDescription':
    'എല്ലാ 25 സ്റ്റേഷനുകളിലെയും കൊച്ചി മെട്രോ സമയം, നിരക്ക്, അവസാന ട്രെയിൻ മുന്നറിയിപ്പ്. ട്രെയിൻ എവിടെയെന്ന് മാത്രമല്ല, എപ്പോൾ ഇറങ്ങണമെന്നും അറിയുക. ഓഫ്‌ലൈനിലും പ്രവർത്തിക്കും.',
  'meta.stationTitle': '{name} മെട്രോ സ്റ്റേഷൻ - സമയം, ആദ്യ, അവസാന ട്രെയിൻ',
  'meta.routeTitle': '{origin} മുതൽ {destination} വരെ മെട്രോ - സമയം, നിരക്ക് Rs {fare}',

  // -------------------------------------------------------------- provenance
  'prov.scheduled': 'KMRL പ്രസിദ്ധീകരിച്ച സമയവിവരപ്പട്ടികയിലെ സമയങ്ങൾ — തത്സമയമല്ല.',
  'prov.confirmed': 'ഈ സമയങ്ങൾ നിലവിലുള്ളതാണെന്ന് KMRL {month}-ൽ സ്ഥിരീകരിച്ചു.',

  // ----------------------------------------------------------------- booking
  'booking.heading': 'ടിക്കറ്റുകൾ',
  'booking.body':
    'KMRL അവരുടെ സ്വന്തം നമ്പറിൽ WhatsApp വഴി ടിക്കറ്റ് വിൽക്കുന്നു. ഈ ലിങ്ക് "Book Ticket" എന്ന സന്ദേശവുമായി ആ ചാറ്റ് തുറക്കും — അയയ്ക്കുന്നത് നിങ്ങൾ തന്നെ.',
  'booking.cta': 'WhatsApp വഴി ബുക്ക് ചെയ്യുക',
  'booking.note':
    'ഇത് നിങ്ങളുടെ യാത്രാവിവരം കൂടെ കൊണ്ടുപോകില്ല, അതിനാൽ എവിടേക്കാണ് പോകുന്നതെന്ന് ബോട്ടിനോട് പറയുക. ബുക്കിംഗ് KMRL-ന്റെ സേവനമാണ്, അത് പൂർണ്ണമായും WhatsApp-ൽ നടക്കുന്നു; getmymetro ടിക്കറ്റ് വിൽക്കുന്നില്ല, പണം സ്വീകരിക്കുന്നില്ല, നിങ്ങൾ അയയ്ക്കുന്നത് കാണുന്നുമില്ല.',

  // ------------------------------------------------------------- day service
  'caveat.holidayHeading': 'അവധിദിന സമയവിവരപ്പട്ടിക',
  'caveat.holidayBody':
    'ഇന്ന് {names} ആണ്. KMRL ഞായറാഴ്ചത്തെ സമയവിവരപ്പട്ടികയാണ് പിന്തുടരുന്നത്, ഇവ ഞായറാഴ്ചത്തെ സമയങ്ങളാണ്.',
  'caveat.unknownHeading': 'ഇന്ന് പൊതു അവധിയാണെങ്കിൽ',
  'caveat.unknownBody':
    'ഇവ KMRL-ന്റെ തിങ്കൾ മുതൽ ശനി വരെയുള്ള സമയങ്ങളാണ്. പൊതു അവധി ദിവസങ്ങളിൽ പകരം ഞായറാഴ്ചത്തെ സമയവിവരപ്പട്ടികയാണ് പ്രവർത്തിക്കുക, അത് ഏകദേശം 90 മിനിറ്റ് വൈകിയാണ് തുടങ്ങുന്നത്. അവധി ദിവസങ്ങളുടെ പട്ടിക KMRL പ്രസിദ്ധീകരിക്കാത്തതിനാൽ ഇന്നത്തേത് ഞങ്ങൾക്ക് പരിശോധിക്കാനാകില്ല.',

  // -------------------------------------------------------------------- time
  'time.due': 'ഇപ്പോൾ',
  'time.minutes': '{minutes} മിനിറ്റ്',
  'time.hours': '{hours} മണിക്കൂർ',
  'time.hoursMinutes': '{hours} മണിക്കൂർ {minutes} മിനിറ്റ്',
  'time.metres': '{metres} മീ',
  'time.kilometres': '{kilometres} കി.മീ',

  // -------------------------------------------------------------------- days
  'day.1': 'തിങ്കൾ',
  'day.2': 'ചൊവ്വ',
  'day.3': 'ബുധൻ',
  'day.4': 'വ്യാഴം',
  'day.5': 'വെള്ളി',
  'day.6': 'ശനി',
  'day.7': 'ഞായർ',
  'day.every': 'എല്ലാ ദിവസവും',
  'day.none': 'ദിവസങ്ങളൊന്നുമില്ല',
  'day.range': '{first} മുതൽ {last} വരെ',

  // ------------------------------------------------------------------ months
  'month.1': 'ജനുവരി',
  'month.2': 'ഫെബ്രുവരി',
  'month.3': 'മാർച്ച്',
  'month.4': 'ഏപ്രിൽ',
  'month.5': 'മേയ്',
  'month.6': 'ജൂൺ',
  'month.7': 'ജൂലൈ',
  'month.8': 'ഓഗസ്റ്റ്',
  'month.9': 'സെപ്റ്റംബർ',
  'month.10': 'ഒക്ടോബർ',
  'month.11': 'നവംബർ',
  'month.12': 'ഡിസംബർ',
};

/** Every catalogue, by language. */
export const CATALOGUES = { en: EN, ml: ML } as const;
