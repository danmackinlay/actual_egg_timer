/**
 * The standing lint on the words in the Swift sources.
 *
 *   npm run copy:literals [-- --list]     --list prints every literal read
 *
 * No word reaches an iOS screen except through copy/, so what a wording
 * change changed is the catalogue's diff. This reads the string literals that
 * reach a call putting text on screen or saying it, or a property holding
 * text (`label.text =`, a notification's `title` and `body`). One with a
 * letter in it, less interpolations and number formats, is words, and fails,
 * unless it is a catalogue argument's name in a dictionary's key position
 * (`["grams": .int(68)]`). There is no list of literals let through.
 *
 * Where text reaches a screen:
 * - the system's calls that take text (TEXT_CALLS: Text, Button,
 *   .accessibilityLabel, …), every argument but those labelled for
 *   something else (NOT_TEXT: `systemImage:`, `identifier:`, …);
 * - the app's own functions and views that pass a parameter on to one of
 *   those, found in the sources, to a fixed point (`helpers`): a function's
 *   or an init's parameter, or a struct's stored property, that reaches a
 *   text call or property in its body is text, by its label or position;
 * - and back from there, through names: what `name = …` (`let`, `var`, an
 *   assignment) gives a name in the same file, and what a `static let` or
 *   `static var` is given, or a computed property or function of type
 *   String returns, anywhere. `let s = "…"; Text(s)`, `Text(Words.done)`
 *   and `var title: String { "…" }` are read, and a `switch` or `if`
 *   expression's branches, less its subject, condition and patterns.
 * Names are matched by spelling, not by Swift's scopes, which can only read
 * more than Swift would show. Not read: a closure's body, a subscript's key,
 * or an argument labelled for something else, unless a text call is inside.
 * Known misses: a parameter's default value (`_ s: String = "…"`), and a
 * value that starts on the line after its `=`.
 *
 * Read: ios/App, ios/Widget, EggTimerApp and EggTimerShared, less what only a
 * debug build compiles (an `#if DEBUG` branch, Screenshots.swift). The
 * planted cases are test/copyLiterals.test.ts.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { parseCatalogue, placeholders, templatesOf } from '../src/core/copy.ts';

const DIRS = [
  'ios/App', 'ios/Widget', 'ios/EggTimerCore/Sources/EggTimerApp', 'ios/EggTimerCore/Sources/EggTimerShared',
];

/** Files a release build compiles but never runs: each acts only on launch
 *  arguments, which a release build does not read. */
const DEBUG_FILES = new Set([
  'ios/EggTimerCore/Sources/EggTimerApp/Screenshots.swift',
]);

/** The system's calls whose arguments are text a cook sees or hears. */
const TEXT_CALLS = new Set([
  // SwiftUI views; ForEach's data is what its rows show
  'Text', 'Button', 'Label', 'Toggle', 'Picker', 'TextField', 'SecureField', 'Link', 'ShareLink', 'Menu', 'Section',
  'LabeledContent', 'Stepper', 'NavigationLink', 'ProgressView', 'Gauge', 'DisclosureGroup', 'ContentUnavailableView',
  'AttributedString', 'NSAttributedString', 'ForEach',
  // SwiftUI modifiers
  'navigationTitle', 'navigationBarTitle', 'accessibilityLabel', 'accessibilityHint', 'accessibilityValue',
  'accessibilityInputLabels', 'accessibilityAction', 'alert', 'confirmationDialog', 'help', 'badge',
  // UIKit, notifications, and the app's own VoiceOver announcement
  'setTitle', 'UIAlertController', 'UIAlertAction', 'UIAction', 'UIMenu', 'UNNotificationAction', 'announce',
]);

/** Arguments of a text call that name something other than text. */
const NOT_TEXT = new Set([
  'systemImage', 'systemName', 'image', 'named', 'destination', 'url', 'identifier', 'id', 'forKey', 'tag', 'bundle',
  'tableName', 'comment', 'format', 'specifier', 'in', 'for', 'locale', 'language',
]);

/** Properties whose value is drawn or spoken: `x.text = …`. */
const TEXT_PROPERTIES = new Set([
  'text', 'attributedText', 'title', 'subtitle', 'body', 'placeholder', 'prompt', 'accessibilityLabel',
  'accessibilityValue', 'accessibilityHint',
]);

/** The types of a computed property or function whose value is text. */
const TEXT_TYPES = new Set(['String', 'AttributedString', 'LocalizedStringKey', 'Text']);

/* ------------------------------------------------------------- the lexer */

type Token =
  | { k: 'id'; text: string }
  | { k: 'p'; text: string }
  | { k: 'nl' }
  | { k: 'str'; text: string; key: boolean; inner: Token[] };

/** Swift as tokens, comments dropped. A string literal keeps its text (an
 *  interpolation as `{}`), its interpolations' tokens, and whether a colon
 *  follows at once: a dictionary key, where a ternary's has a space. */
function lex(source: string): Token[] {
  let i = 0;
  // Tokens up to the end, or, in an interpolation, up to its closing `)`.
  const run = (inner: boolean): Token[] => {
    const out: Token[] = [];
    let depth = 0;
    while (i < source.length) {
      const c = source[i];
      const rest = source.slice(i, i + 200);
      const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
      if (rest.startsWith('//')) i = source.indexOf('\n', i) < 0 ? source.length : source.indexOf('\n', i);
      else if (rest.startsWith('/*')) i = source.indexOf('*/', i) + 2;
      else if (rest.startsWith('"""')) throw new Error('multi-line literal: extend the lexer');
      else if (c === '"') out.push(literal());
      else if (c === '`') {
        const end = source.indexOf('`', i + 1);
        out.push({ k: 'id', text: source.slice(i + 1, end) });
        i = end + 1;
      } else if (word !== null) {
        out.push({ k: 'id', text: word[0] });
        i += word[0].length;
      } else if (/^(==|!=|<=|>=|\+=|->)/.test(rest)) {
        out.push({ k: 'p', text: rest.slice(0, 2) });
        i += 2;
      } else {
        i += 1;
        if (c === '\n') out.push({ k: 'nl' });
        if (/\s/.test(c)) continue;
        if (inner && c === ')' && depth-- === 0) return out;
        if (c === '(') depth += 1;
        out.push({ k: 'p', text: c });
      }
    }
    return out;
  };
  const literal = (): Token => {
    let text = '';
    const inner: Token[] = [];
    for (i += 1; i < source.length && source[i] !== '"'; i += 1) {
      if (source[i] !== '\\') { text += source[i]; continue; }
      const e = source[++i];
      if (e === '(') {
        i += 1;
        inner.push(...run(true));
        i -= 1;
        text += '{}';
      } else if (e === 'u' && source[i + 1] === '{') {
        const end = source.indexOf('}', i);
        text += String.fromCodePoint(parseInt(source.slice(i + 2, end), 16));
        i = end;
      } else text += e === 'n' ? '\n' : e === 't' ? '\t' : e;
    }
    i += 1;
    return { k: 'str', text: text, key: source[i] === ':', inner: inner };
  };
  return run(false);
}

const isP = (t: Token | undefined, text: string): boolean => t !== undefined && t.k === 'p' && t.text === text;
const isId = (t: Token | undefined, ...texts: string[]): boolean => t !== undefined && t.k === 'id' && texts.includes(t.text);
const OPEN: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

/** The index after the bracket that closes the one at `start`. */
function closing(tokens: Token[], start: number): number {
  const stack: string[] = [];
  for (let j = start; j < tokens.length; j++) {
    const t = tokens[j];
    if (t.k === 'p' && t.text in OPEN) stack.push(OPEN[t.text]);
    else if (t.k === 'p' && t.text === stack[stack.length - 1] && (stack.pop(), stack.length === 0)) return j + 1;
  }
  return tokens.length;
}

/** The index of the end of the line `start` is on, brackets spanning lines
 *  taken whole. */
function lineEnd(tokens: Token[], start: number): number {
  let end = start;
  while (end < tokens.length && tokens[end].k !== 'nl' && !isP(tokens[end], ';') && !isP(tokens[end], '}')) {
    end = isP(tokens[end], '(') || isP(tokens[end], '[') || isP(tokens[end], '{') ? closing(tokens, end) : end + 1;
  }
  return end;
}

/** A call's arguments, between the parentheses at `open`: each with its
 *  label, if it has one, and its tokens after the label. */
function argumentsAt(tokens: Token[], open: number): { label: string | null; tokens: Token[] }[] {
  const end = closing(tokens, open) - 1;
  const args: Token[][] = [[]];
  for (let j = open + 1; j < end; j++) {
    const t = tokens[j];
    if (t.k === 'p' && t.text in OPEN) {
      args[args.length - 1].push(...tokens.slice(j, closing(tokens, j)));
      j = closing(tokens, j) - 1;
    } else if (isP(t, ',')) args.push([]);
    else if (t.k !== 'nl') args[args.length - 1].push(t);
  }
  return args.filter((a) => a.length > 0).map((a) => (a[0].k === 'id' && isP(a[1], ':')
    ? { label: a[0].text, tokens: a.slice(2) }
    : { label: null, tokens: a }));
}

/** What of an expression reaches the screen: all of it, interpolations
 *  too, but a closure, a subscript's key and a nested call's arguments
 *  labelled for something else. */
function textTokens(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (let j = 0; j < tokens.length; j++) {
    const t = tokens[j];
    // An array literal follows anything but a name, `?`, `!`, `)` or `]`.
    const before = tokens[j - 1];
    if (isP(t, '{') || (isP(t, '[') && (before?.k === 'id' || ['?', '!', ')', ']'].some((x) => isP(before, x))))) {
      j = closing(tokens, j) - 1;
      continue;
    }
    if (isP(t, '(') && before?.k === 'id') {
      for (const a of argumentsAt(tokens, j)) if (a.label === null || !NOT_TEXT.has(a.label)) out.push(...textTokens(a.tokens));
      j = closing(tokens, j) - 1;
      continue;
    }
    out.push(t);
    if (t.k === 'str') out.push(...textTokens(t.inner));
  }
  return out;
}

/** The app's functions and views that take text: the labels, or the
 *  positions of unlabelled arguments, that carry it. */
type Helpers = Map<string, Set<string | number>>;

/** What reaches the screen in `tokens`: the text arguments of every text
 *  call, the system's and the app's, and the value given each text property. */
function textSites(tokens: Token[], helpers: Helpers): Token[] {
  const out: Token[] = [];
  const walk = (ts: Token[]): void => {
    for (let j = 0; j < ts.length; j++) {
      const t = ts[j];
      if (t.k === 'str') walk(t.inner);
      if (t.k !== 'id') continue;
      if (isP(ts[j + 1], '(') && !isId(ts[j - 1], 'func')) {
        argumentsAt(ts, j + 1).forEach((a, n) => {
          const text = TEXT_CALLS.has(t.text) ? a.label === null || !NOT_TEXT.has(a.label)
            : helpers.get(t.text)?.has(a.label ?? n) ?? false;
          if (text) out.push(...textTokens(a.tokens));
        });
      }
      if (TEXT_PROPERTIES.has(t.text) && isP(ts[j - 1], '.') && isP(ts[j + 1], '=')) {
        out.push(...textTokens(ts.slice(j + 2, lineEnd(ts, j + 2))));
      }
    }
  };
  walk(tokens);
  return out;
}

/* ----------------------------------------------------- names and helpers */

/** The expressions each name is given. */
type Values = Map<string, Token[][]>;
const add = (m: Values, name: string, ts: Token[]): void => { m.set(name, [...(m.get(name) ?? []), ts]); };

/** What `name = …` gives each name in `tokens`, `let name: T = …` included;
 *  a `static` one's into `shared`, which every file reads. */
function assigned(tokens: Token[], shared: Values): Values {
  const out: Values = new Map();
  for (let j = 0; j < tokens.length; j++) {
    const t = tokens[j];
    if (t.k !== 'id') continue;
    let eq = j + 1;
    const end = lineEnd(tokens, j);
    if (isId(tokens[j - 1], 'let', 'var') && isP(tokens[eq], ':')) while (eq < end && !isP(tokens[eq], '=')) eq++;
    if (isP(tokens[eq], '=')) add(isId(tokens[j - 2], 'static') ? shared : out, t.text, tokens.slice(eq + 1, lineEnd(tokens, eq + 1)));
  }
  return out;
}

/** What each computed property and function of a text type returns:
 *  `var name: String { … }`, `func name(…) -> String { … }`: each `return`'s
 *  expression, or the whole body if it has none. */
function returned(tokens: Token[], into: Values): void {
  for (let j = 0; j + 1 < tokens.length; j++) {
    if (!isId(tokens[j], 'var', 'func') || tokens[j + 1].k !== 'id') continue;
    let k = isP(tokens[j + 2], '(') ? closing(tokens, j + 2) : j + 2;
    if (!isP(tokens[k], ':') && !isP(tokens[k], '->')) continue;
    if (!isId(tokens[k + 1], ...TEXT_TYPES)) continue;
    for (k += 2; isP(tokens[k], '?') || isP(tokens[k], '!'); k++);
    if (!isP(tokens[k], '{')) continue;
    const body = tokens.slice(k + 1, closing(tokens, k) - 1);
    const name = (tokens[j + 1] as { text: string }).text;
    const returns = body.flatMap((t, r) => (isId(t, 'return') ? [body.slice(r + 1, lineEnd(body, r + 1))] : []));
    if (returns.length === 0) add(into, name, body);
    for (const r of returns) add(into, name, r);
  }
}

/** Calls whose value is their argument's text. */
const PASSING = new Set(['String', 'Substring']);

/** What of an expression is its value: what reaches a text call inside it,
 *  and all of it but a call's arguments (unless it passes them on), a
 *  closure, a subscript's key, and a `switch` or `if`'s subject, condition
 *  and case patterns. */
function valueTokens(tokens: Token[], helpers: Helpers): Token[] {
  const out: Token[] = textSites(tokens, helpers);
  for (let j = 0; j < tokens.length; j++) {
    const t = tokens[j];
    const before = tokens[j - 1];
    const after = before?.k === 'id' || ['?', '!', ')', ']'].some((x) => isP(before, x));
    if (isP(t, '(') && isId(before, ...PASSING)) {
      for (const a of argumentsAt(tokens, j)) out.push(...valueTokens(a.tokens, helpers));
      j = closing(tokens, j) - 1;
    } else if (isId(t, 'switch', 'if', 'else')) {
      let k = j + 1;
      while (k < tokens.length && !isP(tokens[k], '{')) k = isP(tokens[k], '(') || isP(tokens[k], '[') ? closing(tokens, k) : k + 1;
      out.push(...valueTokens(tokens.slice(k + 1, closing(tokens, k) - 1), helpers));
      j = closing(tokens, k) - 1;
    } else if (isId(t, 'case', 'default') && !isP(before, '.')) {
      while (j < tokens.length && !isP(tokens[j], ':')) j = isP(tokens[j], '(') || isP(tokens[j], '[') ? closing(tokens, j) : j + 1;
    } else if (isP(t, '{') || ((isP(t, '(') || isP(t, '[')) && after)) {
      j = closing(tokens, j) - 1;
    } else {
      out.push(t);
      if (t.k === 'str') out.push(...valueTokens(t.inner, helpers));
    }
  }
  return out;
}

/** A function, an init or a struct, its parameters (by the key a call passes
 *  each one: its label, or its position if it has none), and where they go. */
interface Declared { name: string; params: { key: string | number; name: string }[]; body: Token[] }

function declarations(tokens: Token[]): Declared[] {
  const out: Declared[] = [];
  const types: { name: string; from: number; to: number }[] = [];
  for (let j = 0; j + 1 < tokens.length; j++) {
    const next = tokens[j + 1];
    if (isId(tokens[j], 'struct', 'class', 'enum', 'extension', 'actor') && next.k === 'id') {
      let open = j + 2;
      while (open < tokens.length && !isP(tokens[open], '{')) open++;
      const to = closing(tokens, open);
      types.push({ name: next.text, from: open, to: to });
      if (isId(tokens[j], 'struct')) {
        const params: Declared['params'] = [];
        for (let k = open + 1; k < to - 1; k++) {
          if (isP(tokens[k], '{')) k = closing(tokens, k) - 1;
          else if (isId(tokens[k], 'let', 'var') && !isId(tokens[k - 1], 'static') && tokens[k + 1].k === 'id'
            && !isP(tokens[lineEnd(tokens, k) - 1], '}')) {
            const name = (tokens[k + 1] as { text: string }).text;
            params.push({ key: name, name: name });
          }
        }
        out.push({ name: next.text, params: params, body: tokens.slice(open, to) });
      }
    }
    const isInit = isId(tokens[j], 'init') && isP(next, '(');
    if ((isId(tokens[j], 'func') && next.k === 'id' && isP(tokens[j + 2], '(')) || isInit) {
      const open = isInit ? j + 1 : j + 2;
      const params = argumentsAt(tokens, open).map((a, n) => {
        const names = (a.label === null ? a.tokens : []).filter((t) => t.k === 'id').map((t) => t.text);
        // `_ name: T`, `label name: T` or `name: T`; argumentsAt took `name:` as a label.
        return a.label !== null ? { key: a.label, name: a.label }
          : { key: names[0] === '_' ? n : names[0], name: names[1] ?? names[0] };
      });
      let brace = closing(tokens, open);
      while (brace < tokens.length && !isP(tokens[brace], '{') && tokens[brace].k !== 'nl') brace++;
      if (!isP(tokens[brace], '{')) continue;
      // An init's parameters go to the type's stored properties, read in the type's body.
      const type = types.filter((t) => t.from < j && j < t.to).pop();
      const body = isInit && type !== undefined ? tokens.slice(type.from, type.to) : tokens.slice(brace, closing(tokens, brace));
      out.push({ name: isInit ? type?.name ?? 'init' : (next as { text: string }).text, params: params, body: body });
    }
  }
  return out;
}

/** `sites` and, through every name among them, the values it is given. */
function traced(sites: Token[], values: Values[], helpers: Helpers): Token[] {
  const out: Token[] = [];
  const seen = new Set<string>();
  const visit = (ts: Token[]): void => {
    for (const t of ts) {
      out.push(t);
      if (t.k !== 'id' || seen.has(t.text)) continue;
      seen.add(t.text);
      for (const v of values) for (const e of v.get(t.text) ?? []) visit(valueTokens(e, helpers));
    }
  };
  visit(sites);
  return out;
}

/* --------------------------------------------------------------- sources */

/** `source` less what only a debug build compiles: an `#if DEBUG` branch
 *  before its `#else`, and an `#if !DEBUG`'s after. Other conditions are
 *  read on both sides. */
function releaseOnly(source: string): string {
  const open: { debug: 'before' | 'after' | null; past: boolean }[] = [];
  return source.split('\n').map((line) => {
    const d = /^\s*#(if|elseif|else|endif)\b\s*(.*?)\s*(\/\/.*)?$/.exec(line);
    if (d === null) return open.some((o) => o.debug !== null && (o.debug === 'before') !== o.past) ? '' : line;
    if (d[1] === 'if') open.push({ debug: d[2] === 'DEBUG' ? 'before' : /^!\s*DEBUG$/.test(d[2]) ? 'after' : null, past: false });
    else if (d[1] === 'endif') open.pop();
    else if (open.length > 0) open[open.length - 1].past = true;
    return '';
  }).join('\n');
}

/** Whether a literal is words: a letter left without its interpolations and
 *  printf-style number formats (`%d`, `%.{}f`). */
function isWords(text: string): boolean {
  return /\p{L}/u.test(text.replace(/%[-+ 0#]*(\d+|\{\})?(\.(\d+|\{\}))?(ll|l|h)?[a-zA-Z@]/g, '').replace(/\{\}/g, ''));
}

/** What the lint finds in `sources`: every literal read, by file; the app's
 *  text helpers it found; and each literal that is words. `argumentNames`
 *  are the catalogue's, let through in a dictionary's key position. */
export function lintLiterals(sources: { file: string; source: string }[], argumentNames: Set<string>):
  { read: { file: string; text: string }[]; helpers: Helpers; failures: string[] } {
  const files = sources.map((s) => ({ file: s.file, tokens: lex(releaseOnly(s.source)) }));
  const shared: Values = new Map();
  for (const f of files) returned(f.tokens, shared);
  const scoped = files.map((f) => ({ ...f, values: [assigned(f.tokens, shared), shared], declared: declarations(f.tokens) }));
  const helpers: Helpers = new Map();
  for (let changed = true; changed;) {
    changed = false;
    for (const f of scoped) {
      for (const d of f.declared) {
        const reached = new Set(traced(textSites(d.body, helpers), f.values, helpers).flatMap((t) => (t.k === 'id' ? [t.text] : [])));
        for (const p of d.params.filter((q) => reached.has(q.name))) {
          if (!helpers.has(d.name)) helpers.set(d.name, new Set());
          if (!helpers.get(d.name)!.has(p.key)) { helpers.get(d.name)!.add(p.key); changed = true; }
        }
      }
    }
  }
  const read: { file: string; text: string }[] = [];
  const failures: string[] = [];
  for (const f of scoped) {
    for (const t of new Set(traced(textSites(f.tokens, helpers), f.values, helpers))) {
      if (t.k !== 'str') continue;
      read.push({ file: f.file, text: t.text });
      if ((t.key && argumentNames.has(t.text)) || !isWords(t.text)) continue;
      failures.push(`${f.file}: "${t.text}" is words on a screen; give it a key in copy/en.json`);
    }
  }
  return { read: read, helpers: helpers, failures: failures };
}

/* ------------------------------------------------------------------ main */

/** The Swift a release build shows text from, and the catalogue's argument
 *  names. */
export function appSources(): { sources: { file: string; source: string }[]; argumentNames: Set<string> } {
  const en = parseCatalogue(JSON.parse(readFileSync('copy/en.json', 'utf8')));
  const argumentNames = new Set([...en.messages.values()]
    .flatMap((m) => templatesOf(m).flatMap(placeholders).concat(m.kind === 'plural' ? [m.count] : [])));
  const files = DIRS.flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.swift')).map((f) => join(dir, f)));
  const sources = files.filter((f) => !DEBUG_FILES.has(f)).map((f) => ({ file: f, source: readFileSync(f, 'utf8') }));
  return { sources: sources, argumentNames: argumentNames };
}

if (process.argv[1]?.endsWith('copyLiterals.ts')) {
  const { sources, argumentNames } = appSources();
  const { read, helpers, failures } = lintLiterals(sources, argumentNames);
  if (process.argv.includes('--list')) for (const r of read) console.log(`${r.file}: ${JSON.stringify(r.text)}`);
  for (const name of DEBUG_FILES) if (!existsSync(name)) failures.push(`${name} is skipped and is no file; take it off its list`);
  console.log(`${read.length} literals reach the text arguments of ${TEXT_CALLS.size} of the system's calls and `
    + `${helpers.size} of the app's (${[...helpers.keys()].sort().join(', ')}), and text properties.`);
  if (failures.length > 0) {
    console.log(`\n${failures.length} failures:\n${failures.join('\n')}`);
    process.exit(1);
  }
  console.log('none of them is words.');
}
