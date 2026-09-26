/**
 * The Home hero. DESIGN.md §5.2.
 *
 * Three `JourneyRow`s down one teal line: the origin, the train, the
 * destination. The reader's whole answer in one column — where they are, which
 * train, when it leaves, how long, what it costs, when they arrive.
 *
 * The giant countdown is the one number the product exists to show, and it
 * sits *on the line* rather than in a card beside it, which is the design's
 * central idea: the line is the interface, and the journey hangs off it.
 *
 * ## The middle row carries no node
 *
 * Origin and destination are nodes; the train between them is not a place, so
 * it gets `node="none"` and pure rail. That is also what lets the countdown
 * block be as tall as it needs to be — the rail segment stretches to it, and
 * nothing has to know in advance how tall "1 h 12 min" renders in Malayalam at
 * 200% text.
 *
 * ## line-height 0.8 at 96px
 *
 * The hero countdown is set at `line-height: 0.8`, which is safe only because
 * the glyphs are digits with no descenders. The number and its unit are split
 * here for exactly that reason: the number goes into the 96px box and the unit
 * ("min") renders at 23% of it in a normal line box. A countdown that is a
 * *word* rather than a quantity — "Due" — has no space to split on, so it
 * takes the large size whole. D, u and e have no descenders either, so it does
 * not clip; a formatter output that introduced one would, and that is the
 * check to run before adding a new one.
 *
 * ## No destination chosen
 *
 * The line waits, dotted, and the pending node is a dashed ring. Both are
 * *shape* differences rather than colour ones, so the state survives being
 * read in greyscale. The caller supplies the prompt and the button through
 * content projection, because that is the Home screen's copy, not this
 * component's.
 */

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { I18nService } from '../core/i18n/i18n';

import { JourneyRow, type JourneyVariant } from './journey-line';

@Component({
  selector: 'app-journey-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.is-compact]': 'compact()' },
  imports: [JourneyRow],
  styles: `
    :host {
      display: block;
    }

    /* The origin's name. 30px mobile, 44px desktop — the desktop size is
       raised at 1024px by the media query below, since only the Home hero
       grows and the Route stop list does not. */
    .station-name {
      font-size: var(--text-station);
      font-weight: 600;
      line-height: 1.15;
      letter-spacing: var(--tracking-station);
      color: var(--gmm-ink);
      /* Wrap at spaces, never mid-word. Malayalam conjuncts must not be split
         and "Changampuzha Park" must break at its space rather than anywhere.
         DESIGN.md §3. */
      overflow-wrap: break-word;
      word-break: normal;
    }

    /* Malayalam sets larger per em and its conjuncts stack, so it takes the
       smaller size and more leading rather than the same box. No tracking:
       negative letter-spacing on Malayalam breaks conjunct rendering. */
    :host-context([lang='ml']) .station-name {
      font-size: var(--text-station-ml);
      line-height: 1.45;
      letter-spacing: normal;
    }

    /* 30px mobile, 44px desktop (DESIGN.md §3). Declared in this component
       rather than through a global 'lg-*' class: emulated encapsulation
       rewrites '.station-name' to '.station-name[_ngcontent-x]', which is
       (0,2,0), so a bare global class at (0,1,0) would be applied and then
       lose to the rule above it. Every one of the five 'lg-station-lg' uses in
       the app had exactly that defect. */
    @media (min-width: 1024px) {
      .station-name {
        font-size: var(--text-station-lg);
      }

      /* Malayalam's own scale is raised proportionally rather than to the Latin
         44px: the script sits on a taller body and 44px of Malayalam is
         optically larger than 44px of Geist (DESIGN.md §3). */
      :host-context([lang='ml']) .station-name {
        font-size: var(--text-station-ml-lg);
      }
    }

    /* "You're here" and the Change button, on one 44px row. */
    .origin-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--gmm-space-3);
      min-block-size: var(--gmm-touch);
      margin-block-start: 2px;
      /* Wraps at 360px with a long Malayalam name rather than overflowing. */
      flex-wrap: wrap;
    }

    .here {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: var(--text-min);
      color: var(--gmm-ink-2);
    }

    .here-pin {
      flex-shrink: 0;
      inline-size: 1.125rem;
      block-size: 1.125rem;
      fill: none;
      stroke: var(--gmm-line-text);
      stroke-width: 2;
      stroke-linejoin: round;
    }

    /* The compact From / To card: before a destination is chosen there is no
       train to show, so the origin and the "Where to?" field sit together in
       one card, one short dotted line apart. */
    :host(.is-compact) {
      padding: var(--gmm-space-3) var(--gmm-space-4) var(--gmm-space-3) var(--gmm-space-3);
      border: 1px solid var(--gmm-rule);
      border-radius: var(--gmm-radius-panel);
      background-color: var(--gmm-bg);
    }

    :host(.is-compact) .station-name {
      font-size: 1.5rem;
    }

    /* Room between the Change button and the "Where to?" field below it. */
    :host(.is-compact) .origin-meta {
      margin-block-end: var(--gmm-space-3);
    }

    @media (min-width: 1024px) {
      :host(.is-compact) .station-name {
        font-size: 2rem;
      }
    }

    /* The train block, in the middle row. */
    .train {
      display: flex;
      flex-direction: column;
      gap: var(--gmm-space-3);
      padding-block: var(--gmm-space-5) 22px;
    }

    /* "■ Your train · towards Tripunithura". line-text on white is 5.82:1. */
    .your-train {
      display: flex;
      align-items: flex-start;
      gap: var(--gmm-space-2);
      font-size: var(--text-min);
      font-weight: 600;
      line-height: 1.375;
      color: var(--gmm-line-text);
    }

    .your-train-mark {
      flex-shrink: 0;
      margin-block-start: 6px;
      fill: currentColor;
    }

    .countdown-row {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--gmm-space-3);
      flex-wrap: wrap;
    }

    /* 96px mobile, 132px desktop (DESIGN.md §3). line-height 0.8: digits only.

       The desktop size is set here rather than by the global 'lg-countdown-lg'
       hook. Angular's emulated encapsulation rewrites this rule to
       '.countdown[_ngcontent-x]', which is (0,2,0) and beats a bare
       '.lg-countdown-lg' at (0,1,0) — so the hook would be applied, inherited
       into the class list, and quietly lose. The size belongs beside the rule
       it overrides in any case. */
    .countdown {
      display: flex;
      align-items: baseline;
      gap: var(--gmm-space-2);
      font-size: var(--text-countdown);
      font-weight: 600;
      line-height: 0.8;
      letter-spacing: var(--tracking-countdown);
      color: var(--gmm-ink);
    }

    .countdown.is-word {
      font-size: clamp(2.5rem, 6vw, 4.5rem);
      line-height: 1;
      letter-spacing: -0.02em;
    }

    @media (min-width: 1024px) {
      .countdown {
        font-size: var(--text-countdown-lg);
      }

      .countdown.is-word {
        font-size: 5rem;
      }
    }

    /* 22px at 96px, 30px at 132px — proportional, so the desktop override
       needs no second rule. Safe against the floor because the smallest parent
       this is used at is 96px: 0.23 x 96 = 22px. */
    .countdown-unit {
      font-size: 0.23em;
      font-weight: 600;
      letter-spacing: var(--tracking-tight);
    }

    .leaves {
      text-align: end;
    }

    .leaves-label {
      font-size: var(--text-min);
      color: var(--gmm-ink-2);
    }

    .leaves-time {
      font-size: var(--text-time);
      font-weight: 600;
      line-height: 1;
      letter-spacing: var(--tracking-time);
      color: var(--gmm-ink);
    }

    /* "PM" at 16px ink-2, no tracking — it is a label beside a number, not
       part of it. DESIGN.md §3. */
    .meridiem {
      font-size: var(--text-min);
      font-weight: 600;
      letter-spacing: normal;
      color: var(--gmm-ink-2);
    }

    /* "3 min ride · 1 stop · ₹40". */
    .meta {
      font-size: var(--text-min);
      color: var(--gmm-ink-2);
    }

    .countdown-col {
      display: flex;
      flex-direction: column;
    }

    .countdown-eyebrow {
      margin: 0 0 var(--gmm-space-1);
      font-size: var(--text-min);
      font-weight: 600;
      color: var(--gmm-line-text);
      line-height: 1.3;
    }

    /* The destination row: name left, "Arrives 6:24" right. */
    .destination {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .destination-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--gmm-space-3);
      flex-wrap: wrap;
    }

    .arrives {
      white-space: nowrap;
    }

    .arrives-label {
      font-size: var(--text-min);
      color: var(--gmm-ink-2);
    }

    .arrives-time {
      font-size: var(--text-arrival);
      font-weight: 600;
      color: var(--gmm-ink);
    }
  `,
  template: `
    <section [attr.aria-label]="ariaLabel()">
      <!-- Origin. The line starts at this node and runs down. -->
      <app-journey-row node="origin" kind="first" [variant]="variant()" [compact]="compact()">
        <h1 class="station-name">{{ originName() }}</h1>
        <div class="origin-meta">
          <p class="here">
            @if (compact()) {
              <svg viewBox="0 0 24 24" class="here-pin" aria-hidden="true">
                <path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z" />
                <circle cx="12" cy="9.5" r="2.5" />
              </svg>
            }
            <span>{{ hereLabel() }}</span>
          </p>
          <ng-content select="[slot=change]" />
        </div>
      </app-journey-row>

      <!-- The train. No node: a train is not a place. Absent from the compact
           From / To card, where there is no train to show yet. -->
      @if (!compact()) {
      <app-journey-row node="none" kind="through" [variant]="variant()">
        @if (countdown(); as text) {
          <div class="train">
            <p class="your-train">
              <svg viewBox="0 0 10 10" width="10" height="10" class="your-train-mark" aria-hidden="true">
                <rect width="10" height="10" rx="2" />
              </svg>
              <span>{{ t('board.yourTrainTowards', { name: towardsName() }) }}</span>
            </p>

            <div class="countdown-row">
              <div class="countdown-col">
                <p class="countdown-eyebrow">{{ countdownKicker() }}</p>
                <!--
                  The label carries the whole phrase, because the number and its
                  unit are separate elements and read as two fragments otherwise.
                -->
                <p class="countdown tabular" [class.is-word]="countdownUnit() === null" [attr.aria-label]="countdownLabel()">
                  <span aria-hidden="true">{{ countdownNumber() }}</span>
                  @if (countdownUnit(); as unit) {
                    <span class="countdown-unit" aria-hidden="true">{{ unit }}</span>
                  }
                </p>
              </div>

              <div class="leaves tabular">
                <p class="leaves-label">{{ t('journey.leaves') }}</p>
                <p class="leaves-time">
                  {{ departureClock() }}
                  @if (departureMeridiem(); as meridiem) {
                    <span class="meridiem">{{ meridiem }}</span>
                  }
                </p>
              </div>
            </div>

            @if (meta(); as text) {
              <p class="meta tabular">{{ text }}</p>
            }
          </div>
        } @else {
          <!-- No destination, or no service. The caller supplies the words. -->
          <div class="train">
            <ng-content select="[slot=prompt]" />
          </div>
        }
      </app-journey-row>
      }

      <!-- Destination. The line runs down to this node and stops. -->
      <app-journey-row [node]="destinationNode()" kind="last" [variant]="variant()" [compact]="compact()">
        @if (destinationName(); as name) {
          <div class="destination">
            <div class="destination-top">
              <p class="station-name">{{ name }}</p>
              <ng-content select="[slot=change-destination]" />
            </div>
            @if (arrivalClock(); as clock) {
              <p class="arrives tabular">
                <span class="arrives-label">{{ t('journey.arrives') }} </span>
                <span class="arrives-time">{{ clock }}</span>
              </p>
            }
          </div>
        } @else {
          <ng-content select="[slot=destination]" />
        }
      </app-journey-row>
    </section>
  `,
})
export class JourneySummary {
  protected readonly t = inject(I18nService).t;

  /** Where the reader is. */
  readonly originName = input.required<string>();

  /** "You're here", or "From" on the choose-destination screen. */
  readonly hereLabel = input.required<string>();

  /** Where they are going. Null before a destination is chosen. */
  readonly destinationName = input<string | null>(null);

  /** The terminus this train runs towards. Read from the line's end. */
  readonly towardsName = input<string>('');

  /** "5 min", "Due", "1 h 12 min". Null when there is no train to show. */
  readonly countdown = input<string | null>(null);

  /** "6:21", without the meridiem — which is set smaller beside it. */
  readonly departureClock = input<string>('');

  /** "PM". Separate so it can be 16px ink-2 rather than part of the number. */
  readonly departureMeridiem = input<string | null>(null);

  /** "6:24". */
  readonly arrivalClock = input<string | null>(null);

  /** "3 min ride · 1 stop · ₹40". Composed by the caller from real feed data. */
  readonly meta = input<string | null>(null);

  /** The line's state. `dotted` before a destination, `muted` out of service. */
  readonly variant = input<JourneyVariant>('solid');

  /** What a screen reader hears for the section as a whole. */
  readonly ariaLabel = input<string>('');

  /** The From / To card: origin and "Where to?" only, no train row. */
  readonly compact = input<boolean>(false);

  /** A chosen destination is an ink disc; an unchosen one is a dashed ring. */
  protected readonly destinationNode = computed(() =>
    this.destinationName() === null ? 'pending' : 'destination',
  );

  /** See the class comment: split once, on the first space. */
  protected readonly countdownNumber = computed(() => {
    const text = this.countdown() ?? '';
    const space = text.indexOf(' ');
    return space === -1 ? text : text.slice(0, space);
  });

  protected readonly countdownUnit = computed(() => {
    const text = this.countdown() ?? '';
    const space = text.indexOf(' ');
    return space === -1 ? null : text.slice(space + 1);
  });

  protected readonly countdownLabel = computed(() =>
    this.t('journey.countdownLabel', {
      countdown: this.countdown() ?? '',
      name: this.towardsName(),
    }),
  );

  protected readonly countdownKicker = computed(() => {
    const text = this.countdownNumber();
    return text === 'Arriving' || text === 'ഇപ്പോൾ'
      ? this.t('route.nextMetroArriving')
      : this.t('route.nextMetroArrivesIn');
  });
}
