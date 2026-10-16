/**
 * What each key of the catalogue is for, read from beside it: the notes in
 * copy/en.notes.json, and which app shows each key, read from the sources;
 * and which files in copy/ are catalogues.
 *
 * The catalogues hold only what the renderers read, templates and `count`.
 * A key's `surface` (where it is drawn, whose length
 * budget, if it is small, is test/data/surfaces.json's), its `note` and its
 * `example` (the arguments the budget and the review render it with) live in
 * the sidecar,
 * which neither app loads. Which apps show a key is not typed anywhere: a
 * key an app's sources name is that app's.
 */

import { readFileSync, readdirSync } from 'node:fs';

import { type Catalogue, OVERLAYS, render } from '../src/core/copy.ts';

export const NOTES_PATH = 'copy/en.notes.json';

/** Whether a file in copy/ is a catalogue, `<tag>.json`: everything there
 *  but the notes should be, since the apps ship the folder whole. */
export function isCatalogueFile(name: string): boolean {
  return /^[a-zA-Z0-9-]+\.json$/.test(name);
}

/** Every catalogue's tag, sorted: `en`, the overlays and the translations. */
export function catalogueTags(): string[] {
  return readdirSync('copy').filter(isCatalogueFile).map((f) => f.replace(/\.json$/, '')).sort();
}

/** Every translation: a catalogue that is not English and not one of its
 *  regional overlays. Today the English of 1750. */
export function translationTags(): string[] {
  return catalogueTags().filter((tag) => tag !== 'en' && !OVERLAYS.includes(tag));
}

/** One key's notes. */
export interface Notes {
  surface: string;
  note?: string;
  example?: Record<string, string | number>;
}

/** Every key's notes, as copy/en.notes.json has them. */
export function readNotes(path: string = NOTES_PATH): Record<string, Notes> {
  return (JSON.parse(readFileSync(path, 'utf8')) as { notes: Record<string, Notes> }).notes;
}

/** A key's example arguments, or none. */
export function exampleOf(notes: Record<string, Notes>, key: string): Record<string, string | number> {
  return notes[key]?.example ?? {};
}

/** A surface a key is drawn on: what it is, and its length budget in code
 *  points if it is a small one. A surface that wraps freely has none. */
export interface Surface { budget?: number; about: string }

export const SURFACES_PATH = 'test/data/surfaces.json';

export function readSurfaces(path: string = SURFACES_PATH): Record<string, Surface> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, Surface>;
}

/** The counts every plural message is measured at. */
export const PLURAL_COUNTS = [0, 1, 2, 3, 4, 5, 11, 21, 22, 1.5];

/** A key's longest rendering in a catalogue, in code points ("ž" is one
 *  character on a screen): at its example arguments and, for a plural, at
 *  every one of PLURAL_COUNTS. The measure a budget holds (copy.test.ts)
 *  and the review page shows. */
export function longest(catalogue: Catalogue, key: string, notes: Record<string, Notes>): number {
  let found: Catalogue | null = catalogue;
  while (found !== null && !found.messages.has(key)) found = found.fallback;
  const m = found?.messages.get(key);
  const example = exampleOf(notes, key);
  const argSets = m?.kind === 'plural' ? [example, ...PLURAL_COUNTS.map((n) => ({ ...example, [m.count]: n }))] : [example];
  return Math.max(...argSets.map((args) => [...render(catalogue, key, args)].length));
}

export type App = 'web' | 'ios';

function sourceFiles(dir: string, ext: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith(ext))
    .map((f) => `${dir}/${f}`);
}

/** The key types made from the catalogue (tools/copyKeys.ts): they name
 *  every key, and show none. */
const GENERATED = new Set(['src/core/copyKeys.ts', 'ios/EggTimerCore/Sources/EggTimerCopy/CopyKeys.swift']);

/** Each app's sources: what it is built from, so what it can say. */
export function sources(): Record<App, string[]> {
  const own = (files: string[]): string[] => files.filter((f) => !GENERATED.has(f));
  return {
    web: own([...sourceFiles('src/ui', '.ts'), ...sourceFiles('src/core', '.ts'), 'index.html']),
    ios: own([
      ...sourceFiles('ios/App', '.swift'), ...sourceFiles('ios/Widget', '.swift'),
      ...sourceFiles('ios/EggTimerCore/Sources', '.swift'),
    ]),
  };
}

/** Quoted strings shaped like a key: 'group.name', "group.name.more", and
 *  Swift's `group.name`, a CopyKey case. */
const KEY_SHAPE = /['"`]([a-z][a-zA-Z]*(?:\.[a-zA-Z][a-zA-Z0-9]*)+)['"`]/g;

/** The key-shaped strings a file names. */
export function keysIn(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(KEY_SHAPE)].map((m) => m[1]);
}

/** Each of `keys` that an app's sources name, with the apps that name it. */
export function appsUsing(keys: Iterable<string>): Map<string, Set<App>> {
  const wanted = new Set(keys);
  const used = new Map<string, Set<App>>();
  const src = sources();
  for (const app of ['web', 'ios'] as const) {
    for (const file of src[app]) {
      for (const key of keysIn(file)) {
        if (!wanted.has(key)) continue;
        if (!used.has(key)) used.set(key, new Set());
        (used.get(key) as Set<App>).add(app);
      }
    }
  }
  return used;
}
