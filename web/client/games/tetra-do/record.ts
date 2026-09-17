/**
 * A round, written down: what the player did, and when.
 *
 * The game is a pure function of the board and the moves that were made on it, and the board is a
 * function of the date in the URL — so a round is exactly those two things. Put the date and the
 * moves in a link and the round plays again, move for move, on any machine.
 *
 * The times are on the *game's* clock rather than the wall's: milliseconds since the round
 * started, as the game counts them, which is what makes the replay exact rather than close. A
 * frame that arrives late, a hit-stop that holds the clock, a phone that throttles the tab — none
 * of them move an event relative to the others, because none of them move the clock the events
 * are stamped against.
 *
 * The encoding is the small end of the tradeoff. Every move is a time delta and a byte, the whole
 * thing goes through `deflate-raw`, and what comes out is base64url — a full ninety-second round
 * lands in a few hundred characters, which is a link people will paste.
 */

/** What kind of thing the player did. The order is the wire format; only append to it. */
const KINDS = ["begin", "extend", "end", "live", "erase"] as const;

/** One thing the player did, and when. */
export interface Move {
  /** Milliseconds into the round, on the game's own clock. */
  at: number;
  kind: (typeof KINDS)[number];
  /**
   * What it was done to: the cell, for `begin`, `extend` and `erase`.
   *
   * `end` ignores it, and `live` carries the setting itself — `1` when the solid turns under the
   * finger, `0` when it waits for the answer.
   */
  value: number;
}

/** Bumped if the format ever changes, so an old link is refused rather than misread. */
const VERSION = 1;

/** Times are kept to a hundredth of a second, which is finer than a finger and half the bytes. */
const TICK_MS = 10;

// --- the wire format ---------------------------------------------------------

/** LEB128: seven bits at a time, high bit set while more follow. */
function writeVarint(out: number[], value: number): void {
  let rest = value;
  while (rest >= 0x80) {
    out.push((rest & 0x7f) | 0x80);
    rest >>>= 7;
  }
  out.push(rest);
}

/** Reads one varint, and says where the next thing starts. */
function readVarint(
  bytes: Uint8Array,
  start: number,
): { value: number; next: number } | null {
  let value = 0;
  let shift = 0;
  for (let i = start; i < bytes.length; i++) {
    const byte = bytes[i];
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value: value >>> 0, next: i + 1 };
    shift += 7;
    if (shift > 28) return null;
  }
  return null;
}

/** The moves as bytes: a version, then a delta and a packed byte for each. */
function pack(moves: readonly Move[]): Uint8Array {
  const out: number[] = [VERSION];
  let previous = 0;

  for (const move of moves) {
    const at = Math.max(previous, Math.round(move.at / TICK_MS) * TICK_MS);
    writeVarint(out, (at - previous) / TICK_MS);
    previous = at;
    // Three bits of kind and five of value: a cell index is 0–24, and a setting is 0 or 1.
    out.push((KINDS.indexOf(move.kind) << 5) | (move.value & 0x1f));
  }

  return new Uint8Array(out);
}

/** The same, backwards. `null` for anything that is not a recording this version can read. */
function unpack(bytes: Uint8Array): Move[] | null {
  if (bytes.length === 0 || bytes[0] !== VERSION) return null;

  const moves: Move[] = [];
  let at = 0;
  let i = 1;

  while (i < bytes.length) {
    const delta = readVarint(bytes, i);
    if (delta === null || delta.next >= bytes.length) return null;
    at += delta.value * TICK_MS;

    const packed = bytes[delta.next];
    const kind = KINDS[packed >> 5];
    if (kind === undefined) return null;
    moves.push({ at, kind, value: packed & 0x1f });
    i = delta.next + 1;
  }

  return moves;
}

// --- compression -------------------------------------------------------------

/** Runs bytes through one of the browser's own compression streams. */
async function squeeze(
  bytes: Uint8Array,
  through: "deflate-raw" | "inflate-raw",
): Promise<Uint8Array> {
  const stream = through === "deflate-raw"
    ? new CompressionStream("deflate-raw")
    : new DecompressionStream("deflate-raw");
  const piped = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

/**
 * The moves, as the string that goes in the URL.
 *
 * @param moves Everything the player did, in order
 * @returns base64url, with no padding — safe in a query string as it is
 */
export async function encodeMoves(moves: readonly Move[]): Promise<string> {
  const packed = await squeeze(pack(moves), "deflate-raw");
  return packed.toBase64({ alphabet: "base64url", omitPadding: true });
}

/**
 * The moves back out of a URL.
 *
 * Anything that does not decode is `null` rather than an exception: the string came from a link
 * someone may have truncated, edited, or made up, and the page's answer to all three is the same
 * — play the board without a replay.
 *
 * @param text The `rec` parameter
 * @returns The moves, or `null` if this is not a recording
 */
export async function decodeMoves(text: string): Promise<Move[] | null> {
  try {
    const bytes = Uint8Array.fromBase64(text, { alphabet: "base64url" });
    return unpack(await squeeze(bytes, "inflate-raw"));
  } catch {
    return null;
  }
}
