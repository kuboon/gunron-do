/**
 * What a double tap means on this screen.
 *
 * On a document it means "zoom in on this". Here it means "erase this cell", or it means nothing
 * at all — and either way the browser's reading of it is wrong. A player two seconds from the end
 * of a round does not want to be looking at a corner of the board with no way back.
 *
 * Three ways of saying so, because iOS honours them one at a time and not always the one you
 * expect. `touch-action: manipulation` is the first and is CSS's own answer, laid over the page in
 * `pages/tetra-do.tsx`; on iOS it turned out not to be enough on its own. The other two are here:
 *
 *   `touchend`  — the gesture never becomes a click, so nothing downstream of it can happen.
 *   `dblclick`  — and if the taps get that far anyway, the event that names the gesture outright
 *                 is refused as well.
 *
 * `touchend` is only safe where a click is not wanted, because taking its default takes the click
 * with it. That holds for the board, the solid and the clock — none has ever had a handler for
 * one, and the board works in pointer events, which are left alone. `dblclick` costs nothing
 * anywhere: no element on this page has ever wanted one.
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
