/**
 * What the URL says the page is: which board, and whether a round is being replayed.
 *
 * The address bar is the state. `?date=2026-09-11` names the board — the same date is the same
 * board for everyone, forever — and `&rec=…` carries a round played on it. A page with neither is
 * not a page: it is replaced, on the spot, by today's.
 *
 * Today is Tokyo's today, wherever the player is. A board that changed at the reader's local
 * midnight would be a different board for two people talking about it, which is the one thing a
 * daily puzzle cannot be. Japan has no daylight saving, so "Tokyo" is nine hours and no table.
 */

/** Japan is UTC+9, all year. */
const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

/** How far back a random board reaches. Long enough that two of them rarely collide. */
const RANDOM_SPAN_DAYS = 1200;

/** What the URL has to say for itself. */
export interface Session {
  /** The board, as `YYYY-MM-DD`. */
  date: string;
  /** A round recorded on that board, still encoded, or `null` for a board to play. */
  rec: string | null;
}

/** Today in Tokyo, as `YYYY-MM-DD`. */
export function todayInTokyo(): string {
  return new Date(Date.now() + TOKYO_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Whether a string names a real day.
 *
 * The shape is checked first and the value second, because `2026-02-31` has the right shape and
 * is not a day — `Date` rolls it into March, and the round trip is what catches that.
 */
export function isDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === text;
}

/** A day from the last few years, for a board nobody has been served today. */
export function randomDate(): string {
  const days = Math.floor(Math.random() * RANDOM_SPAN_DAYS) + 1;
  const when = Date.now() + TOKYO_OFFSET_MS - days * 24 * 60 * 60 * 1000;
  return new Date(when).toISOString().slice(0, 10);
}

/**
 * The link to a board, and to a round on it.
 *
 * Relative — the query and nothing else — because this is rendered on the server too, where there
 * is no address to be relative to. A browser resolves it against the page it is on, which is the
 * same page, so the two agree.
 *
 * @param date The board's day
 * @param rec An encoded recording, for a link that plays a round back
 * @returns The query string, `?` and all
 */
export function boardUrl(date: string, rec?: string): string {
  const params = new URLSearchParams({ date });
  if (rec !== undefined) params.set("rec", rec);
  return `?${params}`;
}

/**
 * The same link, written out in full, for putting somewhere else.
 *
 * A relative URL is no use on a clipboard, so this is the one that goes in a message. It needs a
 * page to be relative to and so runs only in a browser.
 *
 * @param date The board's day
 * @param rec An encoded recording
 * @returns An absolute URL
 */
export function shareUrl(date: string, rec: string): string {
  return new URL(boardUrl(date, rec), globalThis.location.href).toString();
}

/**
 * What this page is, from its URL — or nothing, because it is on its way somewhere else.
 *
 * A URL with no day, or with something that is not a day, is replaced by today's rather than
 * corrected in place: `replace` rather than `assign`, so the back button goes where the player
 * came from instead of to the address they never meant to be at.
 *
 * @returns The session, or `null` when the page is being replaced
 */
export function readSession(): Session | null {
  const params = new URLSearchParams(globalThis.location.search);
  const date = params.get("date");

  if (date === null || !isDate(date)) {
    globalThis.location.replace(boardUrl(todayInTokyo()));
    return null;
  }

  return { date, rec: params.get("rec") };
}
