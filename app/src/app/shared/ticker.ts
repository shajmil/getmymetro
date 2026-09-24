/**
 * One timer per screen, paused while the tab is hidden.
 *
 * A countdown needs a tick, but a timer per row — or per component — is how a
 * metro app earns a reputation for eating battery on the phone it is supposed
 * to be good on. Every screen that shows a countdown calls this once; the rest
 * of the screen is `computed` off `MetroEngineService.now`, and the engine's
 * index makes each recomputation a binary search and a short walk. (The
 * competitor re-parses ~27,000 time strings a second to do the same job —
 * CLAUDE.md finding 7.)
 *
 * A hidden tab's countdown is read by nobody and browsers throttle the timer
 * anyway, so it stops on `visibilitychange` and restarts on return, catching up
 * in one tick.
 *
 * Call it from `afterNextRender`, never from a constructor: it touches
 * `document`, and running it during server rendering would throw.
 */

import type { DestroyRef } from '@angular/core';

import type { MetroEngineService } from '../core/engine/metro-engine.service';

/** How often a countdown advances. */
export const TICK_MS = 1000;

export function startTicking(engine: MetroEngineService, destroyRef: DestroyRef): void {
  let timer: ReturnType<typeof setInterval> | undefined;

  const stop = (): void => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };
  const start = (): void => {
    if (timer !== undefined) return;
    engine.tick();
    timer = setInterval(() => engine.tick(), TICK_MS);
  };
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') stop();
    else start();
  };

  start();
  document.addEventListener('visibilitychange', onVisibility);
  destroyRef.onDestroy(() => {
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
  });
}
