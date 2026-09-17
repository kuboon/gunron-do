/**
 * What a double tap means on this screen.
 *
 * On a document it means "zoom in on this". Here it means "erase this cell", or it means nothing
 * at all — and either way the browser's reading of it is wrong. A player two seconds from the end
 * of a round does not want to be looking at a corner of the board with no way back.
 *
 * There is no one way to say so that every engine hears, so this says it every way there is. In
 * the order the browser makes its mind up:
 *
 *   `touch-action`  CSS's own answer, laid over the page in `pages/tetra-do.tsx` and over the
 *                   board in `tetra-board.tsx`. The right way to say it, and not always enough.
 *   `touchstart`    the one that lands. WebKit's gestures are recognised from the touch as it
 *                   begins, so a touch whose beginning is refused is never a gesture at all — by
 *                   `touchend` the recogniser has already made up its mind, which is why refusing
 *                   that one alone did nothing.
 *   `gesturestart`  WebKit's own name for a zoom about to happen, refused for the same reason.
 *   `touchend`      the click that would have followed, which nothing here wants.
 *   `dblclick`      and, last, the event that names the gesture outright.
 *
 * What is safe where. `dblclick` costs nothing anywhere: no element on this page has ever wanted
 * one. `touchend` is safe wherever a click is not, because taking its default takes the click with
 * it — true of the board, the solid and the clock, none of which has ever had a handler for one.
 * `touchstart` is the heaviest: it also refuses the scroll that touch might have become, so it
 * belongs only where scrolling was already off, which is the board and nowhere else.
 *
 * None of it touches the trace. The board works in pointer events, which run ahead of these and
 * are not affected by refusing them.
 */

import { on } from "@remix-run/ui";

/**
 * Keeps the browser's own double tap off an element.
 *
 * Spread into a `mix`, since it is more than one listener: `mix={[style, ...refuseDoubleTap()]}`.
 *
 * @returns The mixins that refuse it
 */
export function refuseDoubleTap() {
  return [
    on<HTMLElement>("touchend", (event) => event.preventDefault()),
    on<HTMLElement>("dblclick", (event) => event.preventDefault()),
  ] as const;
}

/** The gestures a touch can still turn into after it has begun, and their WebKit-only names. */
const ZOOMING = ["touchstart", "gesturestart", "gesturechange"] as const;

/**
 * Refuses a touch the chance to become a zoom, from the moment it begins.
 *
 * Only for an element that has given up scrolling anyway — this takes that with it. `gesturestart`
 * and `gesturechange` are WebKit's alone and are unknown to the DOM's own event map, so these are
 * bound by hand rather than through `on`.
 *
 * @param node What the finger is on
 * @param signal What tears the listeners down
 */
export function refuseZoomGestures(node: Element, signal: AbortSignal): void {
  for (const type of ZOOMING) {
    node.addEventListener(type, (event) => event.preventDefault(), {
      // `touchstart` is passive by default in places, and a passive listener may not refuse.
      passive: false,
      signal,
    });
  }
}
