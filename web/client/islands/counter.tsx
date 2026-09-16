import { clientEntry, css, on } from "@remix-run/ui";
import type { Handle } from "@remix-run/ui";

import { color, radius } from "../tokens.ts";
import { clicks } from "./store.ts";

/**
 * A client component ("island"): server-rendered to HTML like everything else, then hydrated in the
 * browser so it becomes interactive.
 *
 * `clientEntry(id, component)` marks it for hydration, and the id is `import.meta.url` — the module
 * naming itself. The export to import is this function's own name, which is why it is written as a
 * named function and not an arrow. Only the server reads any of it: `server/assets.ts` turns the id
 * into the chunk URL at render time, a thing no browser could do for itself, knowing neither the
 * deploy prefix nor the bundler's output naming.
 *
 * Every click also lands in the {@link clicks} store, which `total.tsx` — a *separate* entrypoint —
 * reads. That the two agree is the visible proof that the shared module was emitted once.
 */
export const Counter = clientEntry(
  import.meta.url,
  function Counter(handle: Handle<{ label: string; start?: number }>) {
    let count = handle.props.start ?? 0;

    return () => (
      <button
        type="button"
        mix={[
          counterStyle,
          on("click", () => {
            count++;
            clicks.bump();
            handle.update();
          }),
        ]}
      >
        {handle.props.label}: {count}
      </button>
    );
  },
);

/**
 * The island's own CSS, in the island's own file.
 *
 * It rides along with the component: server-rendered into the page's `<style>` tags, and re-applied
 * by the same mixin when this entrypoint hydrates in the browser.
 */
const counterStyle = css({
  font: "inherit",
  fontWeight: 600,
  cursor: "pointer",
  padding: "0.55rem 1rem",
  border: `1px solid ${color.accent}`,
  borderRadius: radius.md,
  background: color.accent,
  color: color.onAccent,
  "&:active": { transform: "translateY(1px)" },
});
