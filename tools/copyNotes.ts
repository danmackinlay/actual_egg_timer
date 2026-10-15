/**
 * What each key of the catalogue is for, read from beside it: the notes in
 * copy/en.notes.json, and which app shows each key, read from the sources.
 *
 * The catalogues hold only what the renderers read, templates and `count`
 * (DECISIONS.md 122). A key's `surface` (where it is drawn, whose length
 * budget is test/data/surfaces.json's), its `note` and its `example` (the
 * arguments the budget and the review render it with) live in the sidecar,
 * which neither app loads. Which apps show a key is not typed anywhere: a
 * key an app's sources name is that app's.
 */

import { readFileSync, readdirSync } from 'node:fs';

export const NOTES_PATH = 'copy/en.notes.json';

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

export type App = 'web' | 'ios';

function sourceFiles(dir: string, ext: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith(ext))
    .map((f) => `${dir}/${f}`);
}

/** Each app's sources: what it is built from, so what it can say. */
export function sources(): Record<App, string[]> {
  return {
    web: [...sourceFiles('src/ui', '.ts'), ...sourceFiles('src/core', '.ts'), 'index.html'],
    ios: [
      ...sourceFiles('ios/App', '.swift'), ...sourceFiles('ios/Widget', '.swift'),
      ...sourceFiles('ios/EggTimerCore/Sources', '.swift'),
    ],
  };
}

/** Quoted strings shaped like a key: 'group.name', "group.name.more". */
const KEY_SHAPE = /['"`]([a-z][a-zA-Z]*(?:\.[a-zA-Z][a-zA-Z0-9]*)+)['"`]/g;

/** Identifiers that are shaped like keys and are not: notification ids, and
 *  the UserDefaults keys an earlier build's sharing used, which the launch
 *  deletes (EggTimerApp/Store.swift, `retiredKeys`). */
export const NOT_KEYS = new Set(['cook.pull', 'cook.cool', 'share.v1', 'share.attest.v1']);

/** The key-shaped strings a file names. */
export function keysIn(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(KEY_SHAPE)].map((m) => m[1]);
}

/** Every key-shaped string each app's sources name in one of the catalogue's
 *  groups, with the apps that name it. A name that is not a key is the
 *  caller's to refuse (copy.test.ts 6a). */
export function appsUsing(keys: Iterable<string>): Map<string, Set<App>> {
  const groups = new Set([...keys].map((k) => k.split('.')[0]));
  const used = new Map<string, Set<App>>();
  const src = sources();
  for (const app of ['web', 'ios'] as const) {
    for (const file of src[app]) {
      for (const key of keysIn(file)) {
        if (NOT_KEYS.has(key) || !groups.has(key.split('.')[0])) continue;
        if (!used.has(key)) used.set(key, new Set());
        (used.get(key) as Set<App>).add(app);
      }
    }
  }
  return used;
}
