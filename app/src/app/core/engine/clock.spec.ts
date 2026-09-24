/**
 * The midnight bug, tested directly.
 *
 * `24:01:15` is 86,475 seconds and it is **12:01 AM**. Rendering it as 12:01 PM
 * is the single most visible defect in the field (CLAUDE.md finding 7:
 * keralam.co's last train vanishes at midnight because 86,475 is compared
 * against a `Date`-derived value that cannot exceed 86,399). Every assertion
 * below is one a `Date`-based implementation fails.
 */

import { asSeconds } from '../data/seconds';
import {
  clockParts,
  crossesMidnight,
  durationParts,
  formatClock,
  formatClock24,
  formatWait,
  waitMinutes,
} from './clock';
import { gtfsSeconds } from './testing/feed';

describe('clockParts', () => {
  it('reads 24:01:15 as one minute past midnight, on the next day', () => {
    // The oracle converts the GTFS string; nothing here assumes 86475.
    const parts = clockParts(asSeconds(gtfsSeconds('24:01:15')));
    expect(parts.hour24).toBe(0);
    expect(parts.hour12).toBe(12);
    expect(parts.minute).toBe(1);
    expect(parts.second).toBe(15);
    expect(parts.meridiem).toBe('AM');
    expect(parts.dayOffset).toBe(1);
  });

  it('puts midnight and noon both on 12, with the right meridiem', () => {
    expect(clockParts(asSeconds(0))).toMatchObject({ hour12: 12, meridiem: 'AM' });
    expect(clockParts(asSeconds(12 * 3600))).toMatchObject({ hour12: 12, meridiem: 'PM' });
    expect(clockParts(asSeconds(13 * 3600))).toMatchObject({ hour12: 1, meridiem: 'PM' });
    expect(clockParts(asSeconds(11 * 3600 + 59 * 60))).toMatchObject({
      hour12: 11,
      meridiem: 'AM',
    });
  });

  it('keeps 23:59 and 24:01 on different days but one minute apart', () => {
    const before = clockParts(asSeconds(gtfsSeconds('23:59:00')));
    const after = clockParts(asSeconds(gtfsSeconds('24:01:00')));
    expect(before.dayOffset).toBe(0);
    expect(after.dayOffset).toBe(1);
    expect(after.hour24).toBe(0);
  });
});

describe('formatClock', () => {
  it('renders the last train of the night as 12:01 AM, never 12:01 PM', () => {
    const rendered = formatClock(asSeconds(gtfsSeconds('24:01:15')));
    expect(rendered).toBe('12:01 AM');
    expect(rendered).not.toContain('PM');
  });

  it('renders the whole rollover without a discontinuity', () => {
    const times = ['05:00:00', '11:59:00', '12:00:00', '12:01:00', '23:44:11', '24:03:45'];
    expect(times.map((t) => formatClock(asSeconds(gtfsSeconds(t))))).toEqual([
      '5:00 AM',
      '11:59 AM',
      '12:00 PM',
      '12:01 PM',
      '11:44 PM',
      '12:03 AM',
    ]);
  });

  it('adds seconds only when asked', () => {
    expect(formatClock(asSeconds(gtfsSeconds('24:01:15')), { seconds: true })).toBe('12:01:15 AM');
  });

  it('renders the 24-hour face folded at midnight', () => {
    expect(formatClock24(asSeconds(gtfsSeconds('24:01:15')))).toBe('00:01');
    expect(formatClock24(asSeconds(gtfsSeconds('05:00:00')))).toBe('05:00');
    expect(formatClock24(asSeconds(gtfsSeconds('23:44:11')))).toBe('23:44');
  });
});

describe('crossesMidnight', () => {
  it('separates last night\u2019s trains from tonight\u2019s', () => {
    expect(crossesMidnight(asSeconds(gtfsSeconds('23:59:59')))).toBe(false);
    expect(crossesMidnight(asSeconds(gtfsSeconds('24:00:00')))).toBe(true);
    expect(crossesMidnight(asSeconds(gtfsSeconds('24:03:45')))).toBe(true);
  });
});

describe('durations', () => {
  it('rounds a wait down, so a countdown never promises time it has not got', () => {
    expect(waitMinutes(119)).toBe(1);
    expect(waitMinutes(59)).toBe(0);
    expect(durationParts(209)).toMatchObject({ hours: 0, minutes: 3, seconds: 29 });
  });

  it('never reports a negative wait', () => {
    expect(waitMinutes(-30)).toBe(0);
    expect(durationParts(-30)).toMatchObject({ hours: 0, minutes: 0, seconds: 0 });
  });

  it('renders the 45-minute cliff and the run nudge in words', () => {
    // 2,756 s is the real gap before the last train (see departures.spec.ts).
    expect(formatWait(2756)).toBe('45 min');
    expect(formatWait(0)).toBe('Due');
    expect(formatWait(59)).toBe('Due');
    expect(formatWait(120)).toBe('2 min');
    expect(formatWait(3600)).toBe('1 h');
    expect(formatWait(4320)).toBe('1 h 12 min');
  });

  it('refuses a duration that is not a number', () => {
    expect(() => durationParts(Number.NaN)).toThrow(/not a duration/);
  });
});
