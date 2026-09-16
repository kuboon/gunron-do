import { clientEntry, css } from "@remix-run/ui";
import type { Handle } from "@remix-run/ui";

import { color, radius } from "../tokens.ts";
import { clicks } from "./store.ts";

/**
 * A second island, and a second browser entrypoint, that shares module state with `Counter`.
 *
 * It never talks to the counter directly — it subscribes to the {@link clicks} store both islands
 * import. The number below only moves because the two entrypoints resolved that import to the
 * *same* module instance, which is what compiling them as one code-split graph buys.
 */
export const Total = clientEntry(
  import.meta.url,
  function Total(handle: Handle<{ label: string }>) {
    // Server-rendered as 0; the subscription only exists in the browser.
    let total = clicks.total;

    clicks.subscribe(() => {
      total = clicks.total;
      handle.update();
    });

    return () => (
      <output mix={totalStyle}>
        {handle.props.label}: <strong>{total}</strong>
      </output>
    );
  },
);

const totalStyle = css({
  font: "inherit",
  padding: "0.55rem 1rem",
  border: `1px dashed ${color.accent}`,
  borderRadius: radius.md,
});
