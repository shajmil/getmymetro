/**
 * Station FAQ — one source of truth for the visible FAQ and the FAQPage JSON-LD.
 *
 * Why: /station/* already emits FAQPage schema, but the questions are not on the
 * page. Google requires FAQ markup to match visible content, so today it's
 * ignored at best. Render <app-station-faq> on the page and build the FAQPage
 * node from the same stationFaq() call, so the two can never drift.
 *
 *   // in your JSON-LD builder, replace the current FAQPage node with:
 *   faqJsonLd(stationFaq(st, lang))
 *
 *   // in station.component.html, after the Tickets section:
 *   <app-station-faq [station]="st" [lang]="lang" />
 *
 * Map StationFaqInput from whatever your feed model already has.
 */
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type Lang = 'en' | 'ml';

export interface DirectionTimes {
  towards: { en: string; ml: string };   // terminus name
  first: string;                         // "5:11 AM" — already formatted
  last: string;                          // last train that runs all the way
  trainsPerDay: number;
  /** e.g. the 11:55 PM that only runs to Muttom */
  shortLast?: { time: string; until: { en: string; ml: string } };
}

export interface StationFaqInput {
  name: { en: string; ml: string };
  position: number;                      // 1-based, Aluva = 1
  totalStations: number;                 // 25
  weekday: DirectionTimes[];             // 1 entry at a terminus, 2 elsewhere
  sunday: DirectionTimes[];
  fareRange?: { min: number; max: number };
  neighbours?: { prev?: { en: string; ml: string }; next?: { en: string; ml: string } };
  /** Hand-curated; see STATION_EXTRAS. Omit anything you have not verified. */
  landmarks?: { en: string[]; ml: string[] };
  connections?: { en: string[]; ml: string[] };
}

export interface Faq { q: string; a: string }

const join = (xs: string[], lang: Lang) =>
  xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + (lang === 'ml' ? ', ' : ' and ') + xs.at(-1);

export function stationFaq(s: StationFaqInput, lang: Lang): Faq[] {
  const n = s.name[lang];
  const out: Faq[] = [];
  const wk = s.weekday;

  if (lang === 'ml') {
    out.push({
      q: `${n} സ്റ്റേഷനിൽ ആദ്യ മെട്രോ എപ്പോഴാണ്?`,
      a: 'തിങ്കൾ മുതൽ ശനി വരെ: ' + wk.map(d => `${d.towards.ml} ഭാഗത്തേക്ക് ${d.first}`).join('; ') + '.',
    });
    out.push({
      q: `${n} സ്റ്റേഷനിൽ നിന്നുള്ള അവസാന മെട്രോ എപ്പോഴാണ്?`,
      a: wk.map(d => `${d.towards.ml} വരെ പോകുന്ന അവസാന ട്രെയിൻ ${d.last}` +
        (d.shortLast ? ` (${d.shortLast.time} ട്രെയിൻ ${d.shortLast.until.ml} വരെ മാത്രം)` : '')).join('; ') + '.',
    });
    if (s.sunday.length) out.push({
      q: 'ഞായറാഴ്ച സമയം വ്യത്യാസമുണ്ടോ?',
      a: 'ഉണ്ട്. ഞായറാഴ്ച ' + s.sunday.map(d =>
        `${d.towards.ml} ഭാഗത്തേക്ക് ആദ്യ ട്രെയിൻ ${d.first}, അവസാനത്തേത് ${d.last}`).join('; ') + '.',
    });
    if (s.fareRange) out.push({
      q: `${n} സ്റ്റേഷനിൽ നിന്ന് മെട്രോ നിരക്ക് എത്രയാണ്?`,
      a: `₹${s.fareRange.min} മുതൽ ₹${s.fareRange.max} വരെ, ദൂരം അനുസരിച്ച്. മുഴുവൻ നിരക്ക് പട്ടിക ഈ പേജിലുണ്ട്.`,
    });
    if (s.landmarks?.ml.length) out.push({ q: `${n} സ്റ്റേഷന് അടുത്തുള്ള സ്ഥലങ്ങൾ?`, a: join(s.landmarks.ml, 'ml') + '.' });
    if (s.connections?.ml.length) out.push({ q: `${n} സ്റ്റേഷനിൽ നിന്ന് മറ്റ് യാത്രാ സൗകര്യങ്ങൾ?`, a: join(s.connections.ml, 'ml') + '.' });
    return out;
  }

  out.push({
    q: `What time is the first metro at ${n}?`,
    a: 'Monday to Saturday, the first train leaves ' +
      join(wk.map(d => `towards ${d.towards.en} at ${d.first}`), 'en') + '.',
  });
  out.push({
    q: `What time is the last metro from ${n}?`,
    a: wk.map(d => `The last train all the way to ${d.towards.en} leaves at ${d.last}` +
      (d.shortLast ? ` (a later ${d.shortLast.time} runs only as far as ${d.shortLast.until.en})` : '')).join('. ') + '.',
  });
  if (s.sunday.length) out.push({
    q: `Are Kochi Metro timings different on Sunday at ${n}?`,
    a: 'Yes. On Sundays ' + join(s.sunday.map(d =>
      `trains towards ${d.towards.en} run from ${d.first} to ${d.last} (${d.trainsPerDay} trains)`), 'en') + '.',
  });
  out.push({
    q: `How many trains stop at ${n} each day?`,
    a: `${wk.reduce((t, d) => t + d.trainsPerDay, 0)} trains on weekdays across both directions` +
      (s.sunday.length ? `, and ${s.sunday.reduce((t, d) => t + d.trainsPerDay, 0)} on Sundays.` : '.'),
  });
  if (s.fareRange) out.push({
    q: `What is the Kochi Metro fare from ${n}?`,
    a: `Between ₹${s.fareRange.min} and ₹${s.fareRange.max}, depending on how far you go. The full fare table is on this page.`,
  });
  if (s.neighbours?.prev && s.neighbours?.next) out.push({
    q: `Which stations are next to ${n}?`,
    a: `${n} is station ${s.position} of ${s.totalStations} on Line 1, between ${s.neighbours.prev.en} and ${s.neighbours.next.en}.`,
  });
  if (s.landmarks?.en.length) out.push({ q: `What is near ${n} metro station?`, a: join(s.landmarks.en, 'en') + '.' });
  if (s.connections?.en.length) out.push({ q: `Can I change to other transport at ${n}?`, a: 'Yes: ' + join(s.connections.en, 'en') + '.' });
  return out;
}

/** Drop-in replacement for the current FAQPage node in the @graph. */
export function faqJsonLd(faqs: Faq[]) {
  return {
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}

/**
 * Hand-curated extras keyed by slug. VERIFY before shipping — these are
 * well-known places, but I have not walked the exits. Delete anything wrong.
 */
export const STATION_EXTRAS: Record<string, Pick<StationFaqInput, 'landmarks' | 'connections'>> = {
  'aluva': { connections: { en: ['Aluva railway station', 'KSRTC Aluva bus stand'], ml: ['ആലുവ റെയിൽവേ സ്റ്റേഷൻ', 'ആലുവ KSRTC ബസ് സ്റ്റാൻഡ്'] } },
  'cochin-university': { landmarks: { en: ['CUSAT campus'], ml: ['കുസാറ്റ് ക്യാമ്പസ്'] } },
  'edapally': { landmarks: { en: ['Lulu Mall', "St. George's Forane Church, Edappally"], ml: ['ലുലു മാൾ', 'ഇടപ്പള്ളി പള്ളി'] } },
  'jln-stadium': { landmarks: { en: ['Jawaharlal Nehru International Stadium'], ml: ['ജവഹർലാൽ നെഹ്റു സ്റ്റേഡിയം'] } },
  'maharajas-college': { landmarks: { en: ["Maharaja's College", 'Ernakulam Market'], ml: ['മഹാരാജാസ് കോളേജ്', 'എറണാകുളം മാർക്കറ്റ്'] } },
  'ernakulam-south': { connections: { en: ['Ernakulam Junction (South) railway station'], ml: ['എറണാകുളം ജംഗ്ഷൻ (സൗത്ത്) റെയിൽവേ സ്റ്റേഷൻ'] } },
  'vyttila': { connections: { en: ['Vyttila Mobility Hub buses', 'Kochi Water Metro, Vyttila terminal'], ml: ['വൈറ്റില മൊബിലിറ്റി ഹബ് ബസുകൾ', 'വാട്ടർ മെട്രോ വൈറ്റില ടെർമിനൽ'] } },
  'tripunithura': { landmarks: { en: ['Hill Palace'], ml: ['ഹിൽ പാലസ്'] }, connections: { en: ['Tripunithura railway station'], ml: ['തൃപ്പൂണിത്തുറ റെയിൽവേ സ്റ്റേഷൻ'] } },
};

/** Visible FAQ. <details> works without JS and is fully in the prerendered HTML. */
@Component({
  selector: 'app-station-faq',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="faq" aria-labelledby="station-faq-h">
      <h2 id="station-faq-h">{{ lang() === 'ml' ? 'പതിവ് ചോദ്യങ്ങൾ' : station().name.en + ' metro: common questions' }}</h2>
      @for (f of faqs(); track f.q) {
        <details>
          <summary><h3>{{ f.q }}</h3></summary>
          <p>{{ f.a }}</p>
        </details>
      }
    </section>
  `,
  styles: `
    .faq summary { cursor: pointer; list-style-position: outside; }
    .faq summary h3 { display: inline; font-size: 1rem; font-weight: 600; margin: 0; }
    .faq details { padding: .75rem 0; border-bottom: 1px solid currentColor; border-color: color-mix(in srgb, currentColor 15%, transparent); }
    .faq p { margin: .5rem 0 0; }
  `,
})
export class StationFaqComponent {
  station = input.required<StationFaqInput>();
  lang = input<Lang>('en');
  faqs = computed(() => stationFaq(this.station(), this.lang()));
}
