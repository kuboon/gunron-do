/**
 * What the URL says the page is: which board, and whether a round is being replayed.
 *
 * The address bar is the state. `?date=2026-09-11` names the board — the same date is the same
 * board for everyone, forever — and `&rec=…` carries a round played on it.
 *
 * A URL with no day is today's board, and is left alone. The page used to rewrite itself to
 * `?date=` and today's date on arrival, which made the shortest address anyone would type or share
 * — the page's own — flicker into a longer one nobody asked for, and put a date on a link that was
 * meant to say *today* and would go stale the moment it was read. A day in the URL is now only
 * ever a day somebody meant: a board being talked about, or a round being replayed.
 *
 * What does get tidied is anything the page cannot read. `?date=` with something that is not a day
 * is taken out — not corrected to today, which would put a date back in an address nobody asked
 * for — and so is any parameter that is not `date` or `rec`, which in practice means whatever a
 * link shortener, a mail client or a social network stuck on the end of the URL on the way here.
 * `?fbclid=…` is not about this board and never was, and a player who copies the address out of
 * the bar to send to somebody should be sending them the board, not a note about where they
 * personally came from.
 *
 * Today is Tokyo's today, wherever the player is. A board that changed at the reader's local
 * midnight would be a different board for two people talking about it, which is the one thing a
 * daily puzzle cannot be. Japan has no daylight saving, so "Tokyo" is nine hours and no table.
 */

/** Japan is UTC+9, all year. */
const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

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
 * The link to a board, at its shortest.
 *
 * Today's board is what the page is without being asked, so today's link is the page itself —
 * `location.pathname`, because the page is the only thing that knows where it is. The deploy prefix
 * is a render-time value and a browser has no variable to read it from, and `routes.ts` cannot be
 * asked either: it is built on the router, which is server code.
 *
 * Off a browser there is no pathname to take, so the query is written instead. It is the longer way
 * to say the same thing, and the island replaces it with the shorter one as it hydrates.
 *
 * Why bother: a date in the URL is for a day somebody meant, and "today" written out as a date is a
 * link that stops being true tomorrow — which is exactly the link a player is most likely to send
 * someone.
 *
 * @param date The board's day
 * @returns The page itself for today's board, and a query for any other
 */
export function playUrl(date: string): string {
  return date === todayInTokyo() && globalThis.location !== undefined
    ? globalThis.location.pathname
    : boardUrl(date);
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
 * What this page is, from its URL — and the URL tidied to just that.
 *
 * The query is rebuilt from the two things this page understands rather than edited, which is one
 * rule instead of a list of them: a day that is not a day goes, `?fbclid=…` and its family go,
 * a parameter given twice becomes one, and the order is always the same. A missing day is today's
 * and writes nothing, so the address a player arrives at by typing the page's own name is the
 * address they stay at.
 *
 * Put back with `replaceState` rather than a navigation, so the page already loading is the page
 * that runs, and the back button still goes where the player came from. And put back only when it
 * differs, so the ordinary case touches nothing at all.
 *
 * Runs in a browser only — the caller checks for one first.
 *
 * @returns The session this URL describes
 */
export function readSession(): Session {
  const url = new URL(globalThis.location.href);
  const asked = url.searchParams.get("date");
  const date = asked !== null && isDate(asked) ? asked : null;
  const rec = url.searchParams.get("rec");

  const tidy = new URLSearchParams();
  if (date !== null) tidy.set("date", date);
  if (rec !== null) tidy.set("rec", rec);

  const query = tidy.toString();
  const wanted = `${url.pathname}${query === "" ? "" : `?${query}`}${url.hash}`;
  if (wanted !== `${url.pathname}${url.search}${url.hash}`) {
    globalThis.history.replaceState(null, "", wanted);
  }

  return { date: date ?? todayInTokyo(), rec };
}
