/**
 * The review queue for the words, on the command line; its rules are
 * tools/copyApproval.ts's.
 *
 *   npm run copy:queue
 *       what changed since the approved commit, and each translation's
 *       stale twins and the keys it leaves to English
 *   npm run copy:approve [-- <commit>]
 *       record the words at HEAD (or at <commit>) as approved, in
 *       test/data/copy-approved.txt, to be committed
 *
 * The queue only reports: it exits 0 whatever is in it, so it never fails
 * `verify`. Approval is the owner's word, of the whole catalogue: put back
 * what he names, commit, then approve. Approving HEAD refuses while copy/
 * has changes git has not committed, which the record could not name.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

import {
  APPROVED_PATH, type Templates, copyIsDirty, readApproved, reviewQueue, translationTags, twinStatesOf, wordsAt, wordsNow,
  readCatalogue, templatesOf,
} from './copyApproval.ts';
import { appsUsing } from './copyNotes.ts';

function show(t: Templates | null): string {
  if (t === null) return '(none)';
  const entries = Object.entries(t);
  if (entries.length === 1 && 'text' in t) return t['text'];
  return entries.map(([c, s]) => `${c}: ${s}`).join(' | ');
}

function queue(): void {
  const approved = readApproved();
  const now = wordsNow();
  const q = reviewQueue(wordsAt(approved), now);
  const used = appsUsing(Object.keys(now.en.messages));
  const apps = (key: string): string => (key in now.en.messages
    ? `[${(['web', 'ios'] as const).filter((a) => used.get(key)?.has(a)).join(', ')}]` : '[retired]');
  const count = (s: string): number => q.filter((e) => e.state === s).length;
  console.log(`The review queue since ${approved.slice(0, 10)}: ${q.length} keys (${count('changed')} changed, `
    + `${count('added')} added, ${count('retired')} retired) of ${Object.keys(now.en.messages).length} in copy/en.json.`);
  for (const e of q) {
    console.log(`\n${e.state.padEnd(8)} ${e.key} ${apps(e.key)}`);
    if (e.approved !== null) console.log(`  approved  ${show(e.approved)}`);
    if (e.current !== null) console.log(`  now       ${show(e.current)}`);
    for (const o of e.overlays) {
      if (JSON.stringify(o.approved) === JSON.stringify(o.current)) continue;
      console.log(`  ${o.tag.padEnd(8)}  ${show(o.approved)} -> ${show(o.current)}`);
    }
  }
  for (const tag of translationTags()) {
    const twins = readCatalogue(tag);
    const states = twinStatesOf(tag, now.en);
    const stale = [...states].filter(([, s]) => s === 'stale').map(([k]) => k);
    const missing = [...states].filter(([, s]) => s === 'missing').map(([k]) => k);
    console.log(`\n${tag}: ${stale.length} stale, written against older English; ${missing.length} show the English`
      + `${missing.length > 0 ? `: ${missing.join(', ')}` : ''}.`);
    for (const key of stale) {
      console.log(`\nstale    ${key} ${apps(key)}`);
      console.log(`  twin      ${show(templatesOf(twins.messages[key]))}`);
      console.log(`  English   ${show(templatesOf(now.en.messages[key]))}`);
    }
  }
  console.log('\nRead it on a phone: npm run copy:review. Once what the owner named is put back and committed: '
    + 'npm run copy:approve.');
}

function approve(args: string[]): void {
  if (args.length > 1 || args.some((a) => a.startsWith('-'))) {
    console.error('copy:approve records the whole catalogue at one commit, never key by key: put back what the owner '
      + 'named, commit, then `npm run copy:approve`, or `npm run copy:approve -- <commit>` for the commit he read.');
    process.exit(2);
  }
  if (args.length === 0 && copyIsDirty()) {
    console.error('copy/ has changes git has not committed, which no commit can record: commit them (or put them back), '
      + 'then approve.');
    process.exit(2);
  }
  let commit: string;
  try {
    commit = execFileSync('git', ['rev-parse', '--verify', `${args[0] ?? 'HEAD'}^{commit}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    console.error(`not a commit: ${args[0]}; copy:approve records the whole catalogue at a commit, never key by key.`);
    process.exit(2);
  }
  const before = readApproved();
  writeFileSync(APPROVED_PATH, `${commit}\n`);
  const left = reviewQueue(wordsAt(commit), wordsNow()).length;
  console.log(`approved the words at ${commit.slice(0, 10)} (was ${before.slice(0, 10)}); ${left} keys left in the queue. `
    + `Commit ${APPROVED_PATH}.`);
}

const [mode, ...args] = process.argv.slice(2);
if (mode === 'queue') queue();
else if (mode === 'approve') approve(args);
else {
  console.error('usage: copyQueue.ts queue | approve [<commit>]');
  process.exit(2);
}
