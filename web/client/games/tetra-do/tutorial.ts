/**
 * Whether the walkthrough is up, and whether it is wanted at all.
 *
 * A store rather than state inside the island, for one reason: two islands need it. The
 * walkthrough itself draws it, and the "how to play" card underneath carries the button that asks
 * for it again — which matters, because "do not show this again" is otherwise a door that locks
 * behind you.
 *
 * The preference lives in `localStorage`, read once and lazily. Lazily because this module is
 * imported by islands that also render on the server, where there is no storage to read and
 * nothing to decide yet.
 */

/** Where the preference is kept between visits. */
const STORAGE_KEY = "tetra-do:tutorial";

class Tutorial {
  #open = false;
  /** `null` until the preference has been read, so the read happens in a browser. */
  #dismissed: boolean | null = null;
  #listeners = new Set<() => void>();

  /** Whether the walkthrough is on screen. */
  get open(): boolean {
    return this.#open;
  }

  /**
   * Whether the player has said they do not want it again.
   *
   * A browser with storage blocked reads as "not dismissed": being shown the walkthrough once per
   * visit is a smaller annoyance than never being shown it at all.
   */
  get dismissed(): boolean {
    if (this.#dismissed === null) {
      try {
        this.#dismissed = localStorage.getItem(STORAGE_KEY) === "off";
      } catch {
        this.#dismissed = false;
      }
    }
    return this.#dismissed;
  }

  /** Puts it on screen. */
  show(): void {
    if (this.#open) return;
    this.#open = true;
    this.#emit();
  }

  /** Takes it away, leaving whatever was under it. */
  close(): void {
    if (!this.#open) return;
    this.#open = false;
    this.#emit();
  }

  /**
   * Remembers — or forgets — that it is not wanted.
   *
   * @param dismissed Whether to skip it on the next visit
   */
  remember(dismissed: boolean): void {
    this.#dismissed = dismissed;
    try {
      localStorage.setItem(STORAGE_KEY, dismissed ? "off" : "on");
    } catch {
      // Storage blocked: the choice holds for this visit and is forgotten with the tab.
    }
    this.#emit();
  }

  /**
   * @param listener What to run when any of this changes
   * @returns The way to stop listening
   */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}

export const tutorial: Tutorial = new Tutorial();
