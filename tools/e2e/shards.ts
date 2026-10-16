/**
 * The scenarios split into `n` shards, each run by a CI job of its own
 * (`npm run e2e -- --shard 2/4`, .github/workflows/verify.yml): sorted by
 * name and dealt round-robin, so every scenario is in exactly one shard and
 * where it lands depends on the list alone, never on the machine.
 */

/** `i/n`, one-based, read; a throw if it is not one of n shards. */
export function parseShard(text: string): { i: number; n: number } {
  const m = /^(\d+)\/(\d+)$/.exec(text);
  const i = m === null ? NaN : Number(m[1]);
  const n = m === null ? NaN : Number(m[2]);
  if (!(n >= 1 && i >= 1 && i <= n)) throw new Error(`--shard ${text}: want i/n, 1 <= i <= n`);
  return { i: i, n: n };
}

/** The `i`th of `n` shards of `names` (one-based), in order of name. */
export function shard(names: readonly string[], i: number, n: number): string[] {
  return [...names].sort().filter((_, k) => k % n === i - 1);
}
