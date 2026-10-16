/**
 * The fit's data (INFERENCE.md section 9): the
 * shared eggs pulled down, simulated cooks with a known truth to check the
 * fit against, and the physics each egg needs, written out so the fit
 * (fit/, Python) never runs it.
 *
 *   npm run eggs -- pull <out.jsonl>
 *       every record in the live store, one per line: { tier, seq, record }.
 *       The tier is the one it counts in: attested only under a key from
 *       Apple's production environment (`countedTier`).
 *       Needs NETLIFY_AUTH_TOKEN (a personal access token) and
 *       NETLIFY_SITE_ID. The output is people's eggs: it stays out of git
 *       (fit/data/ is ignored), and is deleted with the id when they ask.
 *       `all.jsonl` and `emulated.json` beside it, built from the last pull,
 *       are deleted, so a result deleted since does not live on in them.
 *       Nothing pulled is trusted, whatever its ID: anyone who learned an
 *       ID could have posted under it (tools/eggsImport.ts).
 *   npm run eggs -- import <results.json> [<out.jsonl>] [--uid <id>]
 *       a results file ("Export my results") as records in
 *       the same shape, open and marked `source: 'export'`, under the file's
 *       random ID or `--uid`, and `trusted` if that ID is on the list;
 *       fit/data/imported.jsonl unless told. To fit on both, put the pull
 *       first: `cat pulled.jsonl imported.jsonl > all.jsonl`; emulate keeps
 *       the first of an egg seen twice, trusted if any copy of it was.
 *   npm run eggs -- simulate <out.jsonl> <truth.json> [cooks] [seed] [--truth <in.json>]
 *       cooks drawn from a population whose answer is known, as records in
 *       the same shape, and the truth beside them. The population is
 *       `SIMULATED_TRUTH` unless `--truth` names a file of its nine numbers
 *       (`Truth`, bare or under `truth` as the truth file has them): the
 *       fit's calibration check (`python -m eggfit sbc`) draws one from the
 *       fit's prior for each repetition.
 *   npm run eggs -- emulate <in.jsonl> <out.json>
 *       for every egg that teaches, its log yolk and white doses and its
 *       peak yolk temperature at the time it is scored at, on a grid of
 *       time-scales: the emulator the fit's likelihood interpolates
 *       (tools/eggsSimulate.ts, which does both of these).
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { countedTier, keyKey } from '../server/eggs.ts';
import {
  type Line, TRUSTED_ENV, TRUSTED_FILE, importResults, readTrusted, tagTrusted,
} from './eggsImport.ts';
import { SIMULATED_TRUTH, emulate, parseTruth, simulateCooks } from './eggsSimulate.ts';

function readLines(path: string): Line[] {
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Line);
}

function writeLines(path: string, lines: Line[]): void {
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
}

/* ------------------------------------------------------------------- pull */

/** The files the fit's loop (fit/README.md) builds beside a pull from it. */
const PULL_DERIVED = ['all.jsonl', 'emulated.json'];

async function pull(out: string): Promise<void> {
  const token = process.env['NETLIFY_AUTH_TOKEN'];
  const siteID = process.env['NETLIFY_SITE_ID'];
  if (token === undefined || siteID === undefined) {
    throw new Error('pull needs NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID');
  }
  const { getStore } = await import('@netlify/blobs');
  const store = getStore({ name: 'eggs', siteID: siteID, token: token, consistency: 'strong' });
  const { blobs } = await store.list({ prefix: 'records/' });
  // Each id's App Attest key, read once: a record counts as attested only if
  // its key is from production, as the server files it.
  const keys = new Map<string, { environment: string } | null>();
  const lines: Line[] = [];
  let demoted = 0;
  for (const b of blobs) {
    const m = /^records\/(attested|open)\/([^/]+)\/(\d+)\.json$/.exec(b.key);
    if (m === null) continue;
    const text = await store.get(b.key, { type: 'text' });
    if (text === null) continue;
    const kept = m[1] as Line['tier'];
    const uid = m[2];
    if (kept === 'attested' && !keys.has(uid)) {
      const raw = await store.get(keyKey(uid), { type: 'text' });
      keys.set(uid, raw === null ? null : JSON.parse(raw) as { environment: string });
    }
    const tier = countedTier(kept, keys.get(uid) ?? null);
    if (tier !== kept) demoted += 1;
    lines.push({ tier: tier, seq: Number(m[3]), record: JSON.parse(text) as unknown });
  }
  writeLines(out, lines);
  console.log(`${lines.length} records -> ${out}` + (demoted > 0 ? ` (${demoted} filed as attested count as open)` : ''));
  // What was built from the last pull goes with it: it still holds every
  // result deleted on the server since, with its random ID, day and place
  // (privacy/index.html: once deleted, "they leave my computer too").
  for (const name of PULL_DERIVED) {
    const path = join(dirname(out), name);
    if (existsSync(path)) {
      rmSync(path);
      console.log(`${path} was built from an earlier pull: deleted; emulate again`);
    }
  }
}

/* ----------------------------------------------------------------- import */

/** A results file ("Export my results") as records for the fit, in the
 *  shape `pull` writes: see `importResults`. */
function importFile(input: string, out: string, uid: string | null): void {
  const got = importResults(readFileSync(input, 'utf8'), uid);
  const trusted = readTrusted();
  tagTrusted(got.lines, trusted);
  mkdirSync(dirname(out), { recursive: true });
  writeLines(out, got.lines);
  console.log(`${got.lines.length} records under ${got.uid} -> ${out}: ${got.fromStore} from the store, `
    + `${got.fromAside} from copies kept aside, ${got.duplicates} seen twice and written once`);
  console.log(trusted.has(got.uid)
    ? 'that ID is trusted: the fit gives these records full weight.'
    : `that ID is not on the trusted list (${TRUSTED_FILE} or ${TRUSTED_ENV}): the fit counts them as open.`);
}


/* ------------------------------------------------------- simulate, emulate */

function simulateFile(out: string, truthOut: string, cooks: number, seed: number, truthIn: string | null): void {
  const truth = truthIn === null ? SIMULATED_TRUTH : parseTruth(JSON.parse(readFileSync(truthIn, 'utf8')));
  const got = simulateCooks(cooks, seed, truth);
  writeLines(out, got.lines);
  writeFileSync(truthOut, JSON.stringify(got.truth, null, 2) + '\n');
  console.log(`${cooks} simulated cooks, ${got.lines.length} eggs -> ${out}; truth -> ${truthOut}`);
}

function emulateFile(input: string, out: string): void {
  const file = emulate(readLines(input));
  writeFileSync(out, JSON.stringify(file) + '\n');
  const n = file.counts;
  console.log(`${n.eggs} eggs emulated (${n.unanswered} unanswered, ${n.refused} refused, ${n.twice} seen twice) -> ${out}`);
}

/* ------------------------------------------------------------------- main */

/** `--name value` taken out of the arguments, or null. */
function option(args: string[], name: string): string | null {
  const at = args.indexOf(name);
  if (at < 0) return null;
  const value = args[at + 1] ?? null;
  args.splice(at, 2);
  return value;
}

const args = process.argv.slice(2);
const uidFlag = option(args, '--uid');
const truthFlag = option(args, '--truth');
const [command, a, b, c, d] = args;
if (command === 'pull' && a !== undefined) {
  await pull(a);
} else if (command === 'import' && a !== undefined) {
  try {
    importFile(a, b ?? 'fit/data/imported.jsonl', uidFlag);
  } catch (error) {
    console.error(`import: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
} else if (command === 'simulate' && a !== undefined && b !== undefined) {
  try {
    simulateFile(a, b, Number(c ?? 400), Number(d ?? 20261002), truthFlag);
  } catch (error) {
    console.error(`simulate: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
} else if (command === 'emulate' && a !== undefined && b !== undefined) {
  emulateFile(a, b);
} else {
  console.error('usage: npm run eggs -- pull <out.jsonl> | import <results.json> [<out.jsonl>] [--uid <id>]'
    + ' | simulate <out.jsonl> <truth.json> [cooks] [seed] [--truth <population.json>]'
    + ' | emulate <in.jsonl> <out.json>');
  process.exit(2);
}
