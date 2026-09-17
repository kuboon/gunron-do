/**
 * What a double tap means on this screen.
 *
 * On a document it means "zoom in on this". Here it means "erase this cell", or it means nothing
 * at all — and either way the browser's reading of it is wrong. `touch-action` is how to say so in
 * CSS, and the page says it; iOS does not always listen, and a player two seconds from the end of
 * a round does not want to be looking at a corner of the board with no way back.
 *
 * So the second way of saying it, which no engine can ignore: the touch does not get its default.
 *
 * That is only safe where a click is not wanted, because taking a `touchend`'s default takes its
 * click with it. It holds for the board, the solid and the clock — none of them has ever had a
 * handler for one, and the board works in pointer events, which are left alone. The buttons are
 * the other half of the screen and they are not this function's to touch; CSS speaks for them.
 */

import { on } from "@remix-run/ui";

/**
 * @returns A mixin that keeps the browser's own double tap off an element
 */
export function refuseDoubleTap() {
  return on<HTMLElement>("touchend", (event) => event.preventDefault());
}
