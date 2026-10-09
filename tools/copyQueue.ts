/**
 * The review queue for the words, on the command line; the state and its
 * rules are tools/copyApproval.ts's.
 *
 *   npm run copy:queue
 *       what the owner has not approved, and each translation's stale and
 *       missing twins
 *   npm run copy:approve -- <key…|--all> [--at <ref>]
 *       stamp today's English (or <ref>'s) as approved; a removed key named,
 *       or --all, drops its approval
 *   npm run copy:approve -- --translation <tag> <key…|--all>
 *       stamp the English each named twin was written against as today's;
 *       --all is every key the translation has, and a key it lacks is
 *       stamped as left to English on purpose
 *
 * The queue only reports: it exits 0 whatever is in it, so it never fails
 * `verify`. A malformed copy/approved.json or bases file stops it, and a stamp
 * refuses a key the catalogue does not have.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

import {
  APPROVED_ABOUT, APPROVED_PATH, CatalogueJson, Templates, basePath, baseAbout, readApproved, readBases,
  readCatalogue, reviewQueue, stamp, stampBases, translationTags, twinQueue, twinState, writeOnePerLine,
} from './copyApproval.js';

function show(t: Templates | null): string {
  if (t === null) return '(none)';
  const entries = Object.entries(t);
  if (entries.length === 1 && 'text' in t) return t['text'];
  return entries.map(([c, s]) => `${c}: ${s}`).join(' | ');
}

function appsOf(en: CatalogueJson, key: string): string {
  const apps = en.messages[key]?.['apps'];
  return Array.isArray(apps) ? `[${apps.join(', ')}]` : '[retired]';
}

function queue(): void {
  const en = readCatalogue('en');
  const q = reviewQueue(en, readApproved());
  const count = (s: string): number => q.filter((e) => e.state === s).length;
  console.log(`The review queue: ${q.length} keys (${count('changed')} changed, ${count('added')} added, `
    + `${count('removed')} removed) of ${Object.keys(en.messages).length} in copy/en.json.`);
  for (const e of q) {
    console.log(`\n${e.state.padEnd(8)} ${e.key} ${appsOf(en, e.key)}`);
    if (e.approved !== null) console.log(`  approved  ${show(e.approved)}`);
    if (e.current !== null) console.log(`  now       ${show(e.current)}`);
  }
  for (const tag of translationTags()) {
    const twins = readCatalogue(tag);
    const bases = readBases(tag);
    const tq = twinQueue(tag, twins, en, bases);
    const stale = tq.filter((t) => t.state === 'stale').length;
    const left = Object.keys(en.messages).filter((k) => twinState(k, twins, en, bases) === 'leftToEnglish');
    console.log(`\n${tag}: ${stale} stale and ${tq.length - stale} missing of ${Object.keys(en.messages).length} keys`
      + `${left.length > 0 ? `; left to English: ${left.join(', ')}` : ''}.`);
    for (const t of tq) {
      console.log(`\n${t.state.padEnd(8)} ${t.key} ${appsOf(en, t.key)}`);
      if (t.twin !== null) console.log(`  twin      ${show(t.twin)}`);
      console.log(`  English   ${show(t.english)}`);
    }
  }
  console.log('\nRead it on a phone: npm run copy:review. Approve: npm run copy:approve -- <key…|--all>.');
}

/** The keys an argument list names, or `all` for `--all`; exits on a key
 *  not in `known`, or on none at all. */
function keysFrom(args: string[], all: string[], known: Set<string>, what: string): string[] {
  if (args.includes('--all')) return all;
  const unknown = args.filter((k) => !known.has(k));
  if (args.length === 0 || unknown.length > 0) {
    console.error(args.length === 0 ? 'name the keys, or --all' : `not in ${what}: ${unknown.join(', ')}`);
    process.exit(2);
  }
  return args;
}

function approve(args: string[]): void {
  const at = args.indexOf('--at');
  const ref = at >= 0 ? args[at + 1] : undefined;
  if (at >= 0 && ref === undefined) {
    console.error('--at needs a commit');
    process.exit(2);
  }
  const rest = at >= 0 ? args.filter((_, i) => i !== at && i !== at + 1) : args;
  const en = readCatalogue('en');
  const before = readApproved();
  const from = ref === undefined ? null
    : JSON.parse(execFileSync('git', ['show', `${ref}:copy/en.json`], { encoding: 'utf8' })) as CatalogueJson;
  const removed = [...new Set([...Object.keys(before), ...Object.keys(from?.messages ?? {})])]
    .filter((k) => !(k in en.messages));
  const keys = keysFrom(rest, [...Object.keys(en.messages), ...removed],
    new Set([...Object.keys(en.messages), ...removed]), 'copy/en.json or copy/approved.json');
  const after = stamp(before, en, keys, from);
  writeFileSync(APPROVED_PATH, writeOnePerLine(APPROVED_ABOUT, { messages: after }));
  const moved = keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  console.log(`approved ${moved.length} key${moved.length === 1 ? '' : 's'}${ref === undefined ? '' : ` at ${ref}`}`
    + `${moved.length > 0 && moved.length <= 20 ? `: ${moved.join(', ')}` : ''}; `
    + `${reviewQueue(en, after).length} left in the queue.`);
}

function translated(tag: string | undefined, args: string[]): void {
  if (tag === undefined || !translationTags().includes(tag)) {
    console.error(`--translation names one of: ${translationTags().join(', ')}`);
    process.exit(2);
  }
  const en = readCatalogue('en');
  const twins = readCatalogue(tag);
  const keys = keysFrom(args, Object.keys(twins.messages).filter((k) => k in en.messages),
    new Set(Object.keys(en.messages)), 'copy/en.json');
  const before = readBases(tag);
  const after = stampBases(before, twins, en, keys);
  writeFileSync(basePath(tag), writeOnePerLine(baseAbout(tag), { english: after.english, base: after.base }));
  const left = twinQueue(tag, twins, en, after).length;
  console.log(`${tag}: stamped ${keys.length} key${keys.length === 1 ? '' : 's'} at today’s English; `
    + `${left} stale or missing.`);
}

const [mode, ...args] = process.argv.slice(2);
const t = args.indexOf('--translation');
if (mode === 'queue') queue();
else if (mode === 'approve' && t >= 0) translated(args[t + 1], args.filter((_, i) => i !== t && i !== t + 1));
else if (mode === 'approve') approve(args);
else {
  console.error('usage: copyQueue.js queue | approve <key…|--all> [--at <ref>] | approve --translation <tag> <key…|--all>');
  process.exit(2);
}
