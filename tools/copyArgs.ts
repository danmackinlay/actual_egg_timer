/**
 * The arguments each Swift `tr` call gives its key are exactly the key's, so
 * a debug build's assertion in `tr` (EggTimerShared/Copy.swift) cannot stop
 * the app at a cook's tap. Run by `npm test` (test/tools/copyArgs.test.ts).
 *
 * Read: ios/App, ios/Widget, EggTimerApp and EggTimerShared, what only a
 * debug build compiles included, since the assertion is a debug build's;
 * with comments and the words inside string literals blanked (an
 * interpolation's code is read). Each `tr(` and `trChosen(` call is split into its arguments:
 *
 * - a key that is a literal (`` .`a.b` ``), or a ternary whose branches all
 *   are, is checked; any other key (a variable, a property, a call, `??`)
 *   is computed, counted and not read;
 * - arguments that are absent, `[:]`, a dictionary literal whose names are
 *   all string literals, or one name bound by the nearest `let` above to such
 *   a literal, are checked; any other (a `var`, `mapValues`) is computed,
 *   counted and not read.
 *
 * `tr` with a literal key and literal arguments fails unless the names are
 * exactly the key's (`CopyKey.argumentNames`, from copy/en.json's
 * placeholders). `trChosen` with a literal key fails too: its key is not
 * chosen, and `tr` would check it. `CopyRef(` in the core with a literal key
 * fails on a name its key does not take; it may give fewer, since the app
 * adds what only it knows (`tr(ref, extra)`).
 *
 * Not seen: a key or a dictionary that is computed (`--unread` lists each
 * such call); a key handed to a helper that calls `tr` itself
 * (`InfoRow(.`a.b`)`), which `helperKeys` lists for reading by hand when the
 * key takes arguments; a `tr` reached through another name. What the core
 * computes, the app's tests build (EggTimerAppTests/WordsSweepTests.swift).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { parseCatalogue, placeholders, templatesOf } from '../src/core/copy.ts';

export const DIRS = ['ios/App', 'ios/Widget', 'ios/EggTimerCore/Sources/EggTimerApp', 'ios/EggTimerCore/Sources/EggTimerShared'];
export const CORE_DIRS = ['ios/EggTimerCore/Sources/EggTimerCore'];

/** Each key of a catalogue, with the names of the arguments it is rendered
 *  with: as tools/copyKeys.ts writes `CopyKey.argumentNames`. */
export function argumentNames(catalogueJson: unknown): Map<string, Set<string>> {
  const en = parseCatalogue(catalogueJson);
  const out = new Map<string, Set<string>>();
  for (const [key, m] of en.messages) {
    const names = new Set(templatesOf(m).flatMap(placeholders));
    if (m.kind === 'plural') names.add(m.count);
    out.set(key, names);
  }
  return out;
}

/** `source` with comments and the characters inside string literals made
 *  spaces, newlines kept, so every offset is the source's. The quotes stay,
 *  and an interpolation's code is kept as code. */
export function mask(source: string): string {
  const out = source.split('');
  const blank = (i: number) => { if (out[i] !== '\n') out[i] = ' '; };
  // A stack of what is open: a string (its closing delimiter, and the parens
  // depth of an interpolation open inside it) or code inside an interpolation.
  type Str = { close: string; raw: number; multi: boolean };
  const strings: Str[] = [];
  const parens: number[] = []; // per open interpolation, its paren depth
  let i = 0;
  const n = source.length;
  while (i < n) {
    const inString = strings.length > parens.length;
    if (inString) {
      const s = strings[strings.length - 1]!;
      if (source.startsWith(s.close, i)) {
        i += s.close.length;
        strings.pop();
        continue;
      }
      const hashes = '#'.repeat(s.raw);
      if (source.startsWith(`\\${hashes}(`, i)) {
        for (let k = i; k < i + 2 + s.raw; k++) blank(k);
        i += 2 + s.raw;
        parens.push(1);
        continue;
      }
      if (source[i] === '\\' && source.startsWith(`\\${hashes}`, i) && i + 1 + s.raw < n) {
        blank(i);
        for (let k = i + 1; k <= i + 1 + s.raw; k++) blank(k);
        i += 2 + s.raw;
        continue;
      }
      if (source[i] === '\n' && !s.multi) { strings.pop(); i++; continue; } // unterminated: give up on it
      blank(i);
      i++;
      continue;
    }
    if (source.startsWith('//', i)) {
      while (i < n && source[i] !== '\n') blank(i++);
      continue;
    }
    if (source.startsWith('/*', i)) {
      let depth = 0;
      do {
        if (source.startsWith('/*', i)) { depth++; blank(i); blank(i + 1); i += 2; }
        else if (source.startsWith('*/', i)) { depth--; blank(i); blank(i + 1); i += 2; }
        else blank(i++);
      } while (i < n && depth > 0);
      continue;
    }
    const open = /^(#*)("""|")/.exec(source.slice(i, i + 12));
    if (open !== null && (open[1]!.length > 0 || source[i] === '"')) {
      const raw = open[1]!.length;
      const quote = open[2]!;
      strings.push({ close: quote + '#'.repeat(raw), raw, multi: quote === '"""' });
      i += open[0].length;
      continue;
    }
    if (parens.length > 0) {
      if (source[i] === '(') parens[parens.length - 1]!++;
      else if (source[i] === ')' && --parens[parens.length - 1]! === 0) {
        parens.pop();
        blank(i);
        i++;
        continue;
      }
    }
    i++;
  }
  return out.join('');
}

/** The offset of the bracket closing the one opened at `at`, in masked code. */
function closing(code: string, at: number): number {
  let depth = 0;
  for (let i = at; i < code.length; i++) {
    const c = code[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { if (--depth === 0) return i; }
  }
  return -1;
}

/** Split masked `code` between `from` and `to` at its top-level commas, as
 *  [start, end) offsets. */
function split(code: string, from: number, to: number, on = ','): [number, number][] {
  const parts: [number, number][] = [];
  let depth = 0;
  let start = from;
  for (let i = from; i < to; i++) {
    const c = code[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (depth === 0 && c === on) { parts.push([start, i]); start = i + 1; }
  }
  if (code.slice(start, to).trim() !== '') parts.push([start, to]);
  return parts;
}

const KEY = /^\.`([^`]+)`$/;

/** The keys a key expression can be, when every one is a literal: one, or a
 *  ternary's branches. Null when any is computed. */
export function literalKeys(expr: string): string[] | null {
  const e = expr.trim();
  const one = KEY.exec(e);
  if (one !== null) return [one[1]!];
  // A ternary, `cond ? a : b`, with a and b literal or ternaries themselves.
  let depth = 0;
  for (let i = 0; i < e.length; i++) {
    const c = e[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (depth === 0 && c === '?' && /\s/.test(e[i - 1] ?? '') && /\s/.test(e[i + 1] ?? '')) {
      // the `:` matching this `?`, counting nested ternaries
      let nest = 0;
      let d = 0;
      for (let j = i + 1; j < e.length; j++) {
        const cj = e[j];
        if (cj === '(' || cj === '[' || cj === '{') d++;
        else if (cj === ')' || cj === ']' || cj === '}') d--;
        else if (d === 0 && cj === '?' && /\s/.test(e[j - 1] ?? '') && /\s/.test(e[j + 1] ?? '')) nest++;
        else if (d === 0 && cj === ':' && /\s/.test(e[j - 1] ?? '')) {
          if (nest === 0) {
            const a = literalKeys(e.slice(i + 1, j));
            const b = literalKeys(e.slice(j + 1));
            return a === null || b === null ? null : [...a, ...b];
          }
          nest--;
        }
      }
      return null;
    }
  }
  return null;
}

/** The names a dictionary literal gives, from masked `code` and the raw
 *  `source` at the same offsets: null when it is not a literal or a name is
 *  computed. */
function literalNames(code: string, source: string, from: number, to: number): string[] | null {
  const e = code.slice(from, to).trim();
  if (e === '[:]') return [];
  const lead = code.indexOf('[', from);
  if (!e.startsWith('[') || closing(code, lead) !== code.lastIndexOf(']', to - 1) || lead >= to) return null;
  const end = closing(code, lead);
  if (code.slice(end + 1, to).trim() !== '') return null;
  const names: string[] = [];
  for (const [a, b] of split(code, lead + 1, end)) {
    const colon = split(code, a, b, ':');
    if (colon.length < 2) return null;
    const k = code.slice(colon[0]![0], colon[0]![1]);
    const name = /^\s*"(\s*)"\s*$/.exec(k);
    if (name === null) return null;
    const at = colon[0]![0] + k.indexOf('"') + 1;
    names.push(source.slice(at, at + name[1]!.length));
  }
  return names;
}

/** The names of a dictionary bound by `let` before `from`, when the
 *  arguments are that one name: the nearest `let name = [...]` or
 *  `let name: CopyArgs = [...]` above, a dictionary literal. */
function boundNames(code: string, source: string, from: number, to: number): string[] | null {
  const name = code.slice(from, to).trim();
  if (!/^[A-Za-z_]\w*$/.test(name)) return null;
  const lets = [...code.slice(0, from).matchAll(new RegExp(`\\blet\\s+${name}\\s*(?::\\s*CopyArgs\\s*)?=\\s*\\[`, 'g'))];
  const last = lets[lets.length - 1];
  if (last === undefined) return null;
  const lead = last.index + last[0].length - 1;
  const end = closing(code, lead);
  return end < 0 || end > from ? null : literalNames(code, source, lead, end + 1);
}

export interface Call {
  where: string;
  fn: 'tr' | 'trChosen' | 'CopyRef';
  keys: string[] | null;
  names: string[] | null;
}

/** Each `tr`, `trChosen` and `CopyRef` call in a Swift file, read. */
export function callsIn(file: string, source: string): Call[] {
  const code = mask(source);
  const calls: Call[] = [];
  for (const m of code.matchAll(/(?<![\w.])(tr|trChosen|CopyRef)\(/g)) {
    if (/\bfunc\s+$/.test(code.slice(Math.max(0, m.index - 10), m.index))) continue; // a declaration
    const open = m.index + m[0].length - 1;
    const close = closing(code, open);
    if (close < 0) continue;
    const line = source.slice(0, m.index).split('\n').length;
    const parts = split(code, open + 1, close);
    const unlabelled = parts.filter(([a, b]) => !/^\s*\w+\s*:(?!:)/.test(code.slice(a, b)));
    const keyPart = unlabelled[0];
    const argPart = unlabelled[1];
    const keys = keyPart === undefined ? null : literalKeys(code.slice(keyPart[0], keyPart[1]));
    const names = argPart === undefined ? [] : literalNames(code, source, argPart[0], argPart[1])
      ?? boundNames(code, source, argPart[0], argPart[1]);
    calls.push({ where: `${file}:${line}`, fn: m[1] as Call['fn'], keys, names });
  }
  return calls;
}

/** What is wrong with a call, read: null when nothing, or it cannot be read. */
export function problem(call: Call, names: Map<string, Set<string>>): string | null {
  if (call.keys === null) return null;
  for (const key of call.keys) {
    const takes = names.get(key);
    if (takes === undefined) return `${call.where}: ${key} is not a key of copy/en.json`;
    if (call.fn === 'trChosen') return `${call.where}: trChosen(.\`${key}\`) is a key not chosen; call tr, which checks its arguments`;
    if (call.names === null) continue;
    const given = new Set(call.names);
    const extra = [...given].filter((n) => !takes.has(n));
    const missing = [...takes].filter((n) => !given.has(n));
    if (call.fn === 'CopyRef') {
      if (extra.length > 0) return `${call.where}: CopyRef(.\`${key}\`) is given ${extra.join(', ')}, which it does not take`;
    } else if (extra.length > 0 || missing.length > 0) {
      return `${call.where}: tr(.\`${key}\`) is given [${[...given].sort().join(', ')}] and takes [${[...takes].sort().join(', ')}]; a debug build stops there`;
    }
  }
  return null;
}

/** Each key literal not the key of a `tr`, `trChosen` or `CopyRef` call that
 *  takes arguments: a key handed to a helper, which may render it with none. */
export function helperKeys(file: string, source: string, names: Map<string, Set<string>>): string[] {
  const code = mask(source);
  const read = new Set<number>();
  for (const m of code.matchAll(/(?<![\w.])(?:tr|trChosen|CopyRef)\(/g)) {
    const close = closing(code, m.index + m[0].length - 1);
    const keyPart = split(code, m.index + m[0].length, close)[0];
    if (keyPart === undefined) continue;
    // every literal in the key expression (a ternary's branches too)
    for (const k of code.slice(keyPart[0], keyPart[1]).matchAll(/\.`[^`]+`/g)) read.add(keyPart[0] + k.index);
  }
  const out: string[] = [];
  for (const k of code.matchAll(/\.`([^`]+)`/g)) {
    if (read.has(k.index)) continue;
    const takes = names.get(k[1]!);
    if (takes === undefined || takes.size === 0) continue;
    out.push(`${file}:${source.slice(0, k.index).split('\n').length}: ${k[1]} [${[...takes].sort().join(', ')}]`);
  }
  return out;
}

function swiftFiles(dirs: string[]): string[] {
  return dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.swift')).map((f) => join(d, f)));
}

/** Every call in the app's Swift and the core's CopyRefs, and what fails. */
export function checkTree(): { calls: Call[]; failures: string[]; helpers: string[] } {
  const names = argumentNames(JSON.parse(readFileSync('copy/en.json', 'utf8')));
  const calls: Call[] = [];
  const helpers: string[] = [];
  for (const f of swiftFiles(DIRS)) {
    const source = readFileSync(f, 'utf8');
    calls.push(...callsIn(f, source).filter((c) => c.fn !== 'CopyRef'));
    helpers.push(...helperKeys(f, source, names));
  }
  for (const f of swiftFiles(CORE_DIRS)) calls.push(...callsIn(f, readFileSync(f, 'utf8')).filter((c) => c.fn === 'CopyRef'));
  const failures = calls.map((c) => problem(c, names)).filter((p): p is string => p !== null);
  return { calls, failures, helpers };
}

/** One line saying what was read. */
export function summary(calls: Call[]): string {
  const read = calls.filter((c) => c.keys !== null && c.names !== null).length;
  const keyComputed = calls.filter((c) => c.keys === null).length;
  const argsComputed = calls.filter((c) => c.keys !== null && c.names === null).length;
  return `copy args: ${calls.length} calls, ${read} read; ${keyComputed} with a computed key and ${argsComputed} with computed arguments not read`;
}

if (process.argv[1]?.endsWith('copyArgs.ts')) {
  const { calls, failures, helpers } = checkTree();
  if (process.argv.includes('--unread')) {
    for (const c of calls.filter((c) => c.keys === null || c.names === null)) console.log(`${c.where}: ${c.fn} ${c.keys === null ? 'key' : 'arguments'} computed`);
    for (const h of helpers) console.log(`${h} handed on`);
  }
  console.log(failures.length > 0 ? `${failures.length} failures:\n${failures.join('\n')}` : summary(calls));
  if (failures.length > 0) process.exit(1);
}
