/**
 * The one API that genuinely removes Safari's chrome inside a tab, wired to a button.
 *
 * DELETE ME with the rest of the fullscreen demo — see `pages/fullscreen.tsx` and the root README.
 *
 * Everything CSS can do stops at *measuring* the browser's UI. The Fullscreen API is the only thing
 * on this page that removes it, and it comes with the condition that makes it not-a-CSS-feature: it
 * has to be called from a user gesture. That is why this is a button and not something the page
 * does on load — a page that could go fullscreen by itself would be a phishing primitive.
 *
 * Support is detected at run time rather than sniffed from a version, which is the honest way to
 * write this down: iPhone Safari was without the Fullscreen API for years while iPad had it, so a
 * page that assumed either answer was wrong on half the devices. `fullscreenEnabled` is also the
 * property that goes `false` inside an iframe without `allow="fullscreen"`, which no version check
 * would ever catch.
 *
 * The prefixed calls are kept beside the standard ones for the same reason: Safari shipped
 * `webkitRequestFullscreen` long before `requestFullscreen`, and an old iPad is exactly the device
 * someone tests a page like this on.
 */

import { clientEntry, css, type Handle, on, ref } from "@remix-run/ui";

import { color, font, radius } from "../tokens.ts";

/** The prefixed half of the API, as Safari shipped it. */
type LegacyElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};
type LegacyDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

/** What this browser will let the button do. */
type Support = "unknown" | "standard" | "prefixed" | "none";

export const FullscreenDemo = clientEntry(
  import.meta.url,
  function FullscreenDemo(handle: Handle) {
    let panel: HTMLElement | null = null;
    let support: Support = "unknown";
    let active = false;
    let error = "";
    let checked = false;

    function syncState(): void {
      const legacy = document as LegacyDocument;
      active = document.fullscreenElement === panel ||
        legacy.webkitFullscreenElement === panel;
      void handle.update();
    }

    async function enter(): Promise<void> {
      if (!panel) return;
      error = "";
      const element = panel as LegacyElement;
      try {
        if (element.requestFullscreen) {
          // `navigationUI: "hide"` asks for the browser's own controls to go too, where the
          // browser offers the choice. It is a request, not a guarantee.
          await element.requestFullscreen({ navigationUI: "hide" });
        } else if (element.webkitRequestFullscreen) {
          await element.webkitRequestFullscreen();
        } else {
          throw new Error("No requestFullscreen on this element.");
        }
      } catch (cause) {
        // A rejection here is normal, not exceptional: Safari refuses when the call has drifted
        // out of the gesture, and showing why is more use than swallowing it.
        error = cause instanceof Error ? cause.message : String(cause);
        void handle.update();
      }
    }

    async function leave(): Promise<void> {
      const legacy = document as LegacyDocument;
      try {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (legacy.webkitExitFullscreen) {
          await legacy.webkitExitFullscreen();
        }
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
        void handle.update();
      }
    }

    if (typeof document !== "undefined") {
      const options = { signal: handle.signal } as const;
      document.addEventListener("fullscreenchange", syncState, options);
      document.addEventListener("webkitfullscreenchange", syncState, options);
    }

    return () => {
      if (!checked) {
        checked = true;
        handle.queueTask(() => {
          const legacy = document as LegacyDocument;
          support = document.fullscreenEnabled
            ? "standard"
            : legacy.webkitFullscreenEnabled
            ? "prefixed"
            : "none";
          void handle.update();
        });
      }

      return (
        <div
          mix={[ref((node) => (panel = node as HTMLElement)), panelStyle]}
        >
          <p mix={statusStyle}>
            <strong>Fullscreen API:</strong> {supportLabel(support)}
          </p>

          <p mix={bodyStyle}>
            {active
              ? "This panel is the fullscreen element — no URL bar, no tab bar, no toolbar. Swipe down or press Escape to leave."
              : "Tap the button. If the browser allows it, this panel — and nothing else — fills the screen."}
          </p>

          <button
            type="button"
            disabled={support === "none"}
            mix={[
              buttonStyle,
              on("click", () => {
                if (active) void leave();
                else void enter();
              }),
            ]}
          >
            {active ? "Exit fullscreen" : "Go fullscreen"}
          </button>

          {support === "none"
            ? (
              <p mix={noteStyle}>
                This browser reports no Fullscreen API for ordinary elements.
                Older iPhone Safari is the usual reason — it had none for years
                while iPadOS did. Installing the page to the Home Screen gets
                you the same chrome-free result without it.
              </p>
            )
            : null}

          {error ? <p mix={errorStyle}>Rejected: {error}</p> : null}
        </div>
      );
    };
  },
);

/** What to print for each detection outcome. */
function supportLabel(support: Support): string {
  switch (support) {
    case "standard":
      return "available (unprefixed)";
    case "prefixed":
      return "available, webkit-prefixed only";
    case "none":
      return "not available here";
    default:
      return "checking…";
  }
}

// --- styles -----------------------------------------------------------------

const panelStyle = css({
  display: "grid",
  gap: "0.75rem",
  justifyItems: "start",
  padding: "1.25rem",
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
  background: color.card,

  /*
   * The fullscreen element gets no layout for free — it is the same box, sized to the screen, so
   * the padding that looked right in the page would sit against the bezel. `env(safe-area-inset-*)`
   * is what keeps it clear of the notch and the home indicator, and it is why the page asks for
   * `viewport-fit=cover`.
   */
  "&:fullscreen": {
    display: "grid",
    placeContent: "center",
    justifyItems: "center",
    textAlign: "center",
    width: "100%",
    height: "100%",
    borderRadius: 0,
    background: color.bg,
    paddingTop: "max(1.25rem, env(safe-area-inset-top))",
    paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
    paddingLeft: "max(1.25rem, env(safe-area-inset-left))",
    paddingRight: "max(1.25rem, env(safe-area-inset-right))",
  },

  "&::backdrop": { background: color.bg },
});

const statusStyle = css({
  margin: 0,
  fontFamily: font.mono,
  fontSize: "0.8rem",
  color: color.muted,
});

const bodyStyle = css({ margin: 0, maxWidth: "34rem" });

const buttonStyle = css({
  font: "inherit",
  fontWeight: 600,
  cursor: "pointer",
  padding: "0.55rem 1rem",
  border: `1px solid ${color.accent}`,
  borderRadius: radius.md,
  background: color.accent,
  color: color.onAccent,
  "&:active": { transform: "translateY(1px)" },
  "&:disabled": { opacity: 0.5, cursor: "not-allowed" },
});

const noteStyle = css({
  margin: 0,
  maxWidth: "34rem",
  fontSize: "0.85rem",
  color: color.muted,
});

const errorStyle = css({
  margin: 0,
  fontFamily: font.mono,
  fontSize: "0.8rem",
  color: color.muted,
});
