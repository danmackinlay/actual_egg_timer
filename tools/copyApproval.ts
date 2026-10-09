/**
 * The review queue for the words: which English the owner has approved, which
 * English each translation's twin was written against, and so what is left to
 * read. `tools/copyQueue.ts` is its command line, `tools/copyReview.ts` its
 * page, and `test/copyQueue.test.ts` holds the files' shape.
 *
 * Two kinds of file, both in copy/ beside the catalogues they describe, and
 * neither a catalogue (`isCatalogueFile`):
 *
 *   copy/approved.json      per key of copy/en.json, the English the owner
 *                           approved: its templates and their hash
 *   copy/<tag>.base.json    per key of a translation (copy/<tag>.json, a
 *                           catalogue that is not English and not a regional
 *                           overlay), the hash of the English its twin was
 *                           written against (`base`), or, for a key it leaves
 *                           to English on purpose, of the English it was
 *                           judged to need no twin at (`english`)
 *
 * A key is in the queue when its English hashes otherwise than the approved,
 * or it has no approval (added), or it has an approval and is gone from the
 * English (removed). A twin is stale when its base is not today's English; a
 * key the translation lacks is missing unless it is left to English at
 * today's English (`app.name`). A stale twin keeps showing and a missing one
 * falls back to English (src/core/copy.ts); both are listed, and neither
 * fails a build (DECISIONS.md 103). A malformed file does.
 *
 * The overlays (copy/en-US.json) keep their own `base`, the English text
 * itself, which copy.test.ts 7a holds to today's.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

import { OVERLAYS, PLURAL_CATEGORIES } from '../src/core/copy.js';

/** A message's templates by category: `text`, or each plural form. */
export type Templates = Record<string, string>;

export type Entry = Record<string, unknown>;

export interface CatalogueJson { locale: string; about?: string; messages: Record<string, Entry> }

/** Approved English for one key: its templates, and their hash. */
export type Approval = { hash: string } & Templates;

export const APPROVED_PATH = 'copy/approved.json';

export function basePath(tag: string): string {
  return `copy/${tag}.base.json`;
}

/** The categories a template can be under, in the order they are hashed and shown. */
export const CATEGORIES: readonly string[] = ['text', ...PLURAL_CATEGORIES];

/** Whether a file in copy/ is a catalogue, `<tag>.json`: not the approvals,
 *  and not a translation's bases (whose name has a second dot). */
export function isCatalogueFile(name: string): boolean {
  return /^[a-zA-Z0-9-]+\.json$/.test(name) && name !== 'approved.json';
}

/** Every catalogue's tag, sorted: `en`, the overlays and the translations. */
export function catalogueTags(dir: string = 'copy'): string[] {
  return readdirSync(dir).filter(isCatalogueFile).map((f) => f.replace(/\.json$/, '')).sort();
}

/** Every translation: a catalogue that is not English and not one of its
 *  regional overlays. Today the English of 1750; Czech when it lands. */
export function translationTags(): string[] {
  return catalogueTags().filter((tag) => tag !== 'en' && !OVERLAYS.includes(tag));
}

/** An entry's templates, in `CATEGORIES` order; anything else in it (surface,
 *  apps, note, example, count, base) is not words. */
export function templatesOf(entry: Entry): Templates {
  const out: Templates = {};
  for (const c of CATEGORIES) {
    const t = entry[c];
    if (typeof t === 'string') out[c] = t;
  }
  return out;
}

/** The hash of a message's words: sha256 over its templates as
 *  `[[category, template], …]` in `CATEGORIES` order, 16 hex digits. */
export function hashTemplates(t: Templates): string {
  const pairs = CATEGORIES.filter((c) => typeof t[c] === 'string').map((c) => [c, t[c]]);
  return createHash('sha256').update(JSON.stringify(pairs)).digest('hex').slice(0, 16);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

export function readCatalogue(tag: string): CatalogueJson {
  return readJson(`copy/${tag}.json`) as CatalogueJson;
}

/* ------------------------------------------------------ the files' shape */

const HASH = /^[0-9a-f]{16}$/;

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** What is wrong with an approvals file, if anything: an `about`, and per key
 *  a hash and at least one template, nothing else, the hash the templates'. */
export function approvedProblems(json: unknown): string[] {
  if (!isObject(json) || typeof json['about'] !== 'string' || !isObject(json['messages'])) {
    return ['not { "about": string, "messages": { … } }'];
  }
  const problems: string[] = [];
  for (const [key, a] of Object.entries(json['messages'])) {
    if (!isObject(a) || typeof a['hash'] !== 'string' || !HASH.test(a['hash'])) {
      problems.push(`${key}: no hash of 16 hex digits`);
      continue;
    }
    const others = Object.keys(a).filter((k) => k !== 'hash');
    const bad = others.filter((k) => !CATEGORIES.includes(k) || typeof a[k] !== 'string');
    if (others.length === 0 || bad.length > 0) {
      problems.push(`${key}: holds ${others.join(', ') || 'nothing'}, not templates by category`);
    } else if (hashTemplates(templatesOf(a)) !== a['hash']) {
      problems.push(`${key}: its hash is not its templates' (edited by hand?)`);
    }
  }
  return problems;
}

/** A translation's sources: per key with a twin, the hash of the English it
 *  was written against; per key left to English on purpose, the hash of the
 *  English it was judged at. */
export interface Bases { base: Record<string, string>; english: Record<string, string> }

/** What is wrong with a translation's bases file, if anything. */
export function baseProblems(json: unknown): string[] {
  if (!isObject(json) || typeof json['about'] !== 'string' || !isObject(json['base']) || !isObject(json['english'])) {
    return ['not { "about": string, "english": { … }, "base": { … } }'];
  }
  const problems: string[] = [];
  for (const field of ['english', 'base'] as const) {
    for (const [key, h] of Object.entries(json[field] as Record<string, unknown>)) {
      if (typeof h !== 'string' || !HASH.test(h)) problems.push(`${field} ${key}: not a hash of 16 hex digits`);
    }
  }
  for (const key of Object.keys(json['english'])) {
    if (key in json['base']) problems.push(`${key}: both a twin's base and left to English`);
  }
  return problems;
}

/** The approvals; none before the first stamp. Throws on a malformed file. */
export function readApproved(path: string = APPROVED_PATH): Record<string, Approval> {
  let json: unknown;
  try {
    json = readJson(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new Error(`${path}: ${(e as Error).message}`);
  }
  const problems = approvedProblems(json);
  if (problems.length > 0) throw new Error(`${path} is malformed:\n  ${problems.join('\n  ')}`);
  return (json as { messages: Record<string, Approval> }).messages;
}

/** A translation's bases; none before its first stamp. Throws on a malformed file. */
export function readBases(tag: string): Bases {
  const path = basePath(tag);
  let json: unknown;
  try {
    json = readJson(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { base: {}, english: {} };
    throw new Error(`${path}: ${(e as Error).message}`);
  }
  const problems = baseProblems(json);
  if (problems.length > 0) throw new Error(`${path} is malformed:\n  ${problems.join('\n  ')}`);
  const b = json as Bases;
  return { base: b.base, english: b.english };
}

/* ----------------------------------------------------------- the queue */

export type QueueState = 'changed' | 'added' | 'removed';

export interface Queued {
  key: string;
  /** `changed`: approved once, and the English has moved since; `added`:
   *  never approved; `removed`: approved, and gone from the English. */
  state: QueueState;
  approved: Templates | null;
  current: Templates | null;
}

/** The keys whose English is not the approved English: in catalogue order,
 *  then the removed ones in the approvals' order. */
export function reviewQueue(en: CatalogueJson, approved: Record<string, Approval>): Queued[] {
  const out: Queued[] = [];
  for (const [key, entry] of Object.entries(en.messages)) {
    const current = templatesOf(entry);
    const a = approved[key];
    if (a === undefined) out.push({ key: key, state: 'added', approved: null, current: current });
    else if (a.hash !== hashTemplates(current)) {
      out.push({ key: key, state: 'changed', approved: templatesOf(a), current: current });
    }
  }
  for (const [key, a] of Object.entries(approved)) {
    if (!(key in en.messages)) out.push({ key: key, state: 'removed', approved: templatesOf(a), current: null });
  }
  return out;
}

export type TwinState = 'current' | 'leftToEnglish' | 'stale' | 'missing';

/** Where a translation's twin of one English key stands. */
export function twinState(key: string, twins: CatalogueJson, en: CatalogueJson, bases: Bases): TwinState {
  const english = en.messages[key];
  const has = key in twins.messages;
  const now = english === undefined ? null : hashTemplates(templatesOf(english));
  if (has) return bases.base[key] === now ? 'current' : 'stale';
  return bases.english[key] === now ? 'leftToEnglish' : 'missing';
}

export interface TwinQueued {
  tag: string;
  key: string;
  state: 'stale' | 'missing';
  twin: Templates | null;
  english: Templates;
}

/** The twins of a translation that want rewriting: stale or missing, in the
 *  English's order. */
export function twinQueue(tag: string, twins: CatalogueJson, en: CatalogueJson, bases: Bases): TwinQueued[] {
  const out: TwinQueued[] = [];
  for (const [key, entry] of Object.entries(en.messages)) {
    const state = twinState(key, twins, en, bases);
    if (state !== 'stale' && state !== 'missing') continue;
    const twin = twins.messages[key];
    out.push({ tag: tag, key: key, state: state, twin: twin === undefined ? null : templatesOf(twin), english: templatesOf(entry) });
  }
  return out;
}

/* ---------------------------------------------------------- the stamps */

/** The approvals with `keys` stamped at the English of `en` (or at `from`,
 *  the English of an older commit, for a key it has), and a named key that
 *  neither has dropped. In catalogue order, the removed keys after. */
export function stamp(
  approved: Record<string, Approval>, en: CatalogueJson, keys: readonly string[], from: CatalogueJson | null = null,
): Record<string, Approval> {
  const wanted = new Set(keys);
  const out: Record<string, Approval> = {};
  for (const [key, entry] of Object.entries(en.messages)) {
    const source = from === null ? entry : from.messages[key];
    if (wanted.has(key) && source !== undefined) {
      const t = templatesOf(source);
      out[key] = { hash: hashTemplates(t), ...t };
    } else if (approved[key] !== undefined) {
      out[key] = approved[key];
    }
  }
  for (const [key, a] of Object.entries(approved)) {
    if (!(key in en.messages) && !wanted.has(key)) out[key] = a;
  }
  for (const [key, entry] of Object.entries(from?.messages ?? {})) {
    if (!(key in en.messages) && wanted.has(key)) {
      const t = templatesOf(entry);
      out[key] = { hash: hashTemplates(t), ...t };
    }
  }
  return out;
}

/** A translation's bases with `keys` stamped at today's English: a key with
 *  a twin as written against it, a key without as left to English at it. A
 *  key the English no longer has is dropped, and so is a stamp the twin's
 *  coming or going has made wrong. In the English's order. */
export function stampBases(bases: Bases, twins: CatalogueJson, en: CatalogueJson, keys: readonly string[]): Bases {
  const wanted = new Set(keys);
  const out: Bases = { base: {}, english: {} };
  for (const [key, entry] of Object.entries(en.messages)) {
    const field = key in twins.messages ? 'base' : 'english';
    if (wanted.has(key)) out[field][key] = hashTemplates(templatesOf(entry));
    else if (bases[field][key] !== undefined) out[field][key] = bases[field][key];
  }
  return out;
}

/** JSON with an `about` and one entry of each field per line, as the
 *  catalogues are written, so a stamp is a one-line diff. */
export function writeOnePerLine(about: string, fields: Record<string, Record<string, unknown>>): string {
  const blocks = Object.entries(fields).map(([field, entries]) => {
    const lines = Object.entries(entries).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
    return `  ${JSON.stringify(field)}: {${lines.length === 0 ? '' : `\n${lines.join(',\n')}\n  `}}`;
  });
  return `{\n  "about": ${JSON.stringify(about)},\n${blocks.join(',\n')}\n}\n`;
}

export const APPROVED_ABOUT = 'The English the owner has approved, per key of copy/en.json: its templates and their '
  + 'hash (sha256 of [[category, template], …] in the order text, zero, one, two, few, many, other; 16 hex digits). '
  + 'A key whose English hashes otherwise, or is not here, or is here and gone from the English, is in the review '
  + 'queue: `npm run copy:queue` lists it, `npm run copy:review` writes a page to read it on, and '
  + '`npm run copy:approve -- <key…|--all>` stamps today’s English. Begun from the English of e3a81cb, the last time '
  + 'the owner read every string (`npm run copy:approve -- --all --at e3a81cb` on no file). Never edited by hand: a '
  + 'hash that is not its templates’ fails the tests. Not a catalogue, and no app reads it. LANGUAGE.md section 3.';

export function baseAbout(tag: string): string {
  return `The English each twin in copy/${tag}.json was written against, per key: the hash of its templates, as in `
    + 'copy/approved.json (`base`), and the English each key it leaves to English on purpose was judged at '
    + '(`english`). A twin whose English has moved since is stale, and a key with no twin and not left to English '
    + 'at today’s English is missing: each keeps showing (a missing one in English), and `npm run copy:queue` lists '
    + `it. Rewrite the twin, then \`npm run copy:approve -- --translation ${tag} <key…|--all>\` stamps today’s `
    + 'English (a key named that has no twin is left to English). Never edited by hand. '
    + 'Not a catalogue, and no app reads it. LANGUAGE.md section 3.';
}
