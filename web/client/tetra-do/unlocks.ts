/**
 * Telling GameCenter what the player earned.
 *
 * A small store beside `game`: it watches the game and the walkthrough, and when a round's numbers
 * cross one of `achievements.ts`'s lines it hands the key to the GameCenter SDK. The SDK does the
 * rest. A player who came in from the hub carries a launch token and the unlock is recorded there
 * and then; anyone else has it queued on this device, and the result panel offers one link that
 * records the whole queue — see {@link Unlocks.claimUrl}.
 *
 * What this adds to the SDK is a memory of what has already been earned here. The SDK queues
 * whatever it is told, and without a token it cannot ask the hub what it already has — so a player
 * who claimed 「はじめての成立」 last week would be offered it again on every round they solved.
 * Remembering the keys (and the best 消去) on this device means a key is sent once, and the claim
 * link only ever appears for something new.
 *
 * Browser-only. {@link Unlocks.start} is called from an island once there is a page to read, and
 * until then — and on the server, where the islands are rendered too — every method is a no-op.
 */

import { GameCenter } from "@kuboon/game-center-sdk";

import { gameCenterId } from "../gamecenter.ts";
import {
  GAMECENTER_ID,
  HIGH_SCORE,
  REPLAY,
  ROUND_ACHIEVEMENTS,
  SHARE,
  TUTORIAL,
} from "./achievements.ts";
import { game, type Phase } from "./game.ts";
import { tutorial } from "./tutorial.ts";

/** Where what has been earned here is kept. */
const STORAGE_KEY = "tetra-do:unlocks";

/**
 * Where an unlock waits across a page load.
 *
 * `share` is earned by pressing a button that leaves the page, and an unlock is a network request —
 * which the navigation would cancel. So it is written down first and sent from the page that loads
 * next.
 */
const OWED_KEY = "tetra-do:unlocks-owed";

type Listener = () => void;

/** What has been earned on this device. */
interface Earned {
  keys: string[];
  /** The best 消去 sent as {@link HIGH_SCORE}'s score, or `null` before a round was finished. */
  best: number | null;
}

class Unlocks {
  #center: GameCenter | null = null;
  #earned: Earned = { keys: [], best: null };
  #phase: Phase | null = null;
  #listeners = new Set<Listener>();

  /**
   * Wakes the SDK and starts watching.
   *
   * The SDK takes the launch token out of the URL as it starts, so this is called as early as a
   * page has one — and once: every island that could call it shares this store.
   */
  start(): void {
    if (this.#center !== null || typeof location === "undefined") return;
    this.#center = GameCenter.init({ gameId: gameCenterId(GAMECENTER_ID) });
    this.#earned = readEarned();

    game.subscribe(() => this.#watchGame());
    tutorial.subscribe(() => {
      if (tutorial.finished) void this.#unlock(TUTORIAL.key);
    });

    for (const key of takeOwed()) void this.#unlock(key);
    // The SDK sends its own queue on the way up, when it has a token to send it with.
    void this.#center.ready.then(() => this.#emit());
  }

  /**
   * Where the player records everything waiting, or `null` when nothing is.
   *
   * A link for the player to follow rather than a page opened for them: a popup blocker eats an
   * unasked-for `window.open`, and a player should see what is about to be recorded first.
   */
  get claimUrl(): string | null {
    return this.#center?.claimUrl() ?? null;
  }

  /** How many unlocks are waiting on this device. */
  get pending(): number {
    return this.#center?.pending.length ?? 0;
  }

  /**
   * Notes that a round was turned into a link.
   *
   * Written down rather than sent: the caller is about to leave the page. The page that loads next
   * sends it.
   */
  shared(): void {
    if (this.#center === null || this.#earned.keys.includes(SHARE.key)) return;
    try {
      const owed = new Set(readList(OWED_KEY));
      owed.add(SHARE.key);
      localStorage.setItem(OWED_KEY, JSON.stringify([...owed]));
    } catch { /* storage may be unavailable */ }
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** What the game just did, against every line a round can cross. */
  #watchGame(): void {
    const phase = game.phase;
    const ended = phase === "over" && this.#phase !== "over";
    this.#phase = phase;

    if (game.replaying) {
      if (ended) void this.#unlock(REPLAY.key);
      return;
    }
    if (phase !== "playing" && phase !== "over") return;

    const round = {
      cleared: game.cleared,
      solved: game.solved,
      combo: game.combo,
    };
    for (const achievement of ROUND_ACHIEVEMENTS) {
      if (achievement.earned(round)) void this.#unlock(achievement.key);
    }
    if (ended) void this.#best(round.cleared);
  }

  /** A finished round's 消去, sent when it is the best this device has seen. */
  async #best(cleared: number): Promise<void> {
    const best = this.#earned.best;
    if (best !== null && cleared <= best) return;
    this.#earned = { ...this.#earned, best: cleared };
    writeEarned(this.#earned);
    await this.#center?.unlock(HIGH_SCORE.key, { score: cleared });
    this.#emit();
  }

  /** A key, sent once per device. */
  async #unlock(key: string): Promise<void> {
    if (this.#center === null || this.#earned.keys.includes(key)) return;
    this.#earned = { ...this.#earned, keys: [...this.#earned.keys, key] };
    writeEarned(this.#earned);
    await this.#center.unlock(key);
    this.#emit();
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}

/** The one store every island shares. */
export const unlocks = new Unlocks();

/** What was earned here before, or nothing when storage is empty, unreadable or unavailable. */
function readEarned(): Earned {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return {
      keys: Array.isArray(raw?.keys)
        ? raw.keys.filter((key: unknown) => typeof key === "string")
        : [],
      best: typeof raw?.best === "number" ? raw.best : null,
    };
  } catch {
    return { keys: [], best: null };
  }
}

function writeEarned(earned: Earned): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(earned));
  } catch { /* storage may be unavailable */ }
}

/** The unlocks written down by the page before this one, taken so they are sent once. */
function takeOwed(): string[] {
  const owed = readList(OWED_KEY);
  try {
    localStorage.removeItem(OWED_KEY);
  } catch { /* storage may be unavailable */ }
  return owed;
}

function readList(key: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}
