/**
 * The three puzzles, as one island.
 *
 * The island renders one box, keeps it (`data-rmx-preserve-dom`) and, once it is in a browser, hands
 * it to `puzzles.ts`, which draws the tabs, the boards and the Dotto table into it and runs them.
 * Nothing here re-renders: the puzzles redraw themselves, move by move.
 */

import { clientEntry, css, type Handle, ref } from "@remix-run/ui";

import { color } from "../../tokens.ts";

export const Sa08Puzzles = clientEntry(
  import.meta.url,
  function Sa08Puzzles(handle: Handle) {
    let host: HTMLElement | null = null;
    let stop: (() => void) | null = null;
    let failed = false;

    handle.signal.addEventListener("abort", () => {
      stop?.();
      stop = null;
    }, { once: true });

    function attach(node: Element | null): void {
      if (node === null) {
        stop?.();
        stop = null;
        host = null;
        return;
      }
      if (host === node) return;
      host = node as HTMLElement;
      import("../puzzles.ts")
        .then((puzzles) => {
          if (handle.signal.aborted || host === null || stop !== null) return;
          stop = puzzles.start(host);
        })
        .catch((error) => {
          console.error(error);
          failed = true;
          handle.update();
        });
    }

    return () => (
      <div>
        <div
          mix={ref(attach)}
          data-rmx-preserve-dom
          aria-label="M12・M24・Dotto の3つのパズル"
        >
          {
            /*
            A fixed child, so the reconciler never sees this box as empty and clears what
            `puzzles.ts` drew into it (see the README).
            */
          }
          <span hidden />
        </div>
        {failed
          ? (
            <p mix={errorStyle}>
              パズルを読み込めませんでした。ページを再読み込みしてください。
            </p>
          )
          : null}
      </div>
    );
  },
);

const errorStyle = css({ color: color.muted });
