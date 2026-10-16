/**
 * The scenarios split into `n` shards, each run by a CI job of its own
 * (`npm run e2e -- --shard 2/4`, .github/workflows/verify.yml): every
 * scenario in exactly one shard, the shards about as long as each other.
 *
 * The split is by how long each scenario took on GitHub's 2-core Linux
 * runner, rounded to the second (`SECONDS`, from a CI log of `npm run e2e`;
 * a Mac takes about a third of it): the longest first, each to the shard
 * with least so far. A scenario not in the table counts as `UNTIMED`, so a
 * new one needs no entry to run; the table only keeps the shards level, and
 * needs remaking only when they drift apart. Where a scenario lands depends
 * on the table and the list alone, never on the machine.
 */

/** Seconds each scenario took on CI. */
export const SECONDS: Readonly<Record<string, number>> = {
  'one-layout': 38, 'one-layout-narrow': 39, 'egg-readings': 15, 'likely-band': 14, 'sentence-no-time': 31,
  'certainty-mid-cook': 14, 'cold-cook': 14, 'running-lines': 25, 'hot-start': 6, 'bowl': 15, 'cancel': 10,
  'reload': 28, 'woken-past-pull': 15, 'too-old': 7, 'done-wakes': 7, 'slow-hob': 7, 'owner-case': 7,
  'cold-to-hot-after-tap': 12, 'heavier-lighter': 10, 'overdue-and-back': 13, 'drag-no-ring': 9, 'start-time': 15,
  'settings-mid-cook': 7, 'record-corrected-at-done': 30, 'slider-after-pull': 11, 'still-in-water': 18,
  'start-again-corrected': 25, 'done-stays-done': 57, 'grace-correction': 13, 'change-kept-on-hide': 16,
  'later-answer-refolds': 37, 'done-note-as-ran': 18, 'final-egg': 9, 'probe-reading': 7, 'done-as-ran': 13,
  'sharing-final-only': 24, 'inert-off-localhost': 1, 'unreadable-stores': 7,
  'retired-keys': 14, 'one-tab-waits': 7, 'one-tab-takeover': 17, 'one-tab-silent': 8,
  'copy/idle-default': 7, 'copy/idle-hot': 6, 'copy/us-carton': 7, 'copy/us-carton-jumbo': 8,
  'copy/eu-carton-stored-jumbo': 8, 'copy/idle-hot-standing': 5, 'copy/idle-cold-standing': 36, 'copy/idle-soft': 6,
  'copy/idle-fudgy': 6, 'copy/idle-hard': 6, 'copy/idle-runny-hot': 6, 'copy/refusal-ice': 6, 'copy/refusal-tap': 6,
  'copy/refusal-counter': 7, 'copy/refusal-hardest': 16, 'copy/refusal-hardest-0-75-l': 14,
  'copy/refusal-hardest-1-l': 15, 'copy/white-never-sets': 5, 'copy/custom-temp-measured-egg': 7,
  'copy/room-temp': 7, 'copy/pan-remembered': 7, 'copy/pan-remembered-hot-standing': 5, 'copy/sous-vide-jammy': 7,
  'copy/sous-vide-0-8': 7, 'copy/sous-vide-0-9': 7, 'copy/sous-vide-hard': 7, 'copy/sous-vide-jammy-en-us': 7,
  'copy/sous-vide-hard-en-us': 7, 'copy/hot-cook-spoken-at-61-s-and-1-s': 7, 'copy/cold-cook-twice-then-forget': 51,
  'copy/cold-cook-three-times': 72, 'copy/cold-cook-reloaded-mid-cook': 46, 'copy/hot-soft-tap-white-question': 21,
  'copy/hot-soft-the-white-alone-then-a-reload': 20, 'copy/hot-jammy-the-white-and-then-the-yolk': 21,
  'copy/hot-runny-white-question': 20, 'copy/hot-counter': 20, 'copy/hot-bowl-four-eggs-in-a-litre-at-12-c': 20,
  'copy/refusal-bowl': 7, 'copy/cold-standing-through': 45, 'copy/cold-standing-cancel': 44,
};

/** What a scenario missing from `SECONDS` counts as: about the mean. */
export const UNTIMED = 15;

/** `i/n`, one-based, read; a throw if it is not one of n shards. */
export function parseShard(text: string): { i: number; n: number } {
  const m = /^(\d+)\/(\d+)$/.exec(text);
  const i = m === null ? NaN : Number(m[1]);
  const n = m === null ? NaN : Number(m[2]);
  if (!(n >= 1 && i >= 1 && i <= n)) throw new Error(`--shard ${text}: want i/n, 1 <= i <= n`);
  return { i: i, n: n };
}

/** Which shard, 0 to n - 1, each of `names` is in. */
export function shardsOf(names: readonly string[], n: number): number[] {
  const load = new Array<number>(n).fill(0);
  const of = new Array<number>(names.length).fill(0);
  const order = names.map((_, k) => k);
  const secs = (k: number): number => SECONDS[names[k]] ?? UNTIMED;
  order.sort((a, b) => secs(b) - secs(a) || a - b);
  for (const k of order) {
    let least = 0;
    for (let j = 1; j < n; j++) if (load[j] < load[least]) least = j;
    of[k] = least;
    load[least] += secs(k);
  }
  return of;
}

/** The `i`th of `n` shards of `names` (one-based), in the order given. */
export function shard(names: readonly string[], i: number, n: number): string[] {
  const of = shardsOf(names, n);
  return names.filter((_, k) => of[k] === i - 1);
}
