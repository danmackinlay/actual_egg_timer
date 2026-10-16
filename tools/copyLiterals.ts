/**
 * The standing lint on the words in the Swift sources.
 *
 *   npm run copy:literals [-- --list]     --list prints every literal read
 *
 * No word reaches an iOS screen except through copy/, so what a wording
 * change changed is the catalogue's diff, which the review queue reads
 * (tools/copyQueue.ts). This holds it where Swift's text reaches a screen or
 * a screen reader: the arguments of the calls that put text there, and the
 * properties that do. A string literal there that has a letter in it, once
 * its interpolations and number formats are taken out, is words, and fails,
 * unless it is the name of a catalogue argument in a dictionary's key
 * position (`["grams": .int(68)]`) or on the short NOT_COPY list below. A
 * literal anywhere else (a log line, a stored key, a URL, an SF Symbol's
 * name) is never on a screen, and is not read.
 *
 * Where text reaches the screen:
 * - SwiftUI's, UIKit's and the system's own calls that take text (TEXT_CALLS),
 *   every argument but those whose label names something else (NOT_TEXT:
 *   `systemImage:`, `destination:`, `identifier:` …), and the properties
 *   that hold it (TEXT_PROPERTIES: `label.text =`, a notification's `title`
 *   and `body`, `accessibilityLabel =` …);
 * - the app's own views and functions that pass a parameter of text on to
 *   one of those, found in the sources rather than listed: a function's
 *   parameter, a view's stored property or an init's parameter that reaches
 *   a text call, to a fixed point, so `MoreText(…)`, `barTitle(…)` and
 *   Help's `para(…)` are text calls too, by the label or the position of
 *   that parameter;
 * - and back from there, where a value shown is made: what a `let`, a `var`
 *   or an assignment in the same file gives a name shown, and what a
 *   function or computed property returning a string returns, if its name
 *   is shown, so `let s = "…"; Text(s)` and a `var title: String { "…" }`
 *   are read too. But not what the catalogue's renderers (`tr`) are made of.
 * What a closure inside a call's arguments says is not that call's text;
 * any text call inside it is read as a call of its own. Nor is a subscript's
 * key (`info["CFBundleVersion"]`), or an argument labelled for a locale.
 * Names are matched by spelling, not by Swift's scopes, which can only read
 * more than Swift would show. Planted in each of those places, a literal
 * fails (16 October 2026).
 *
 * Read in the code that draws or says anything: ios/App, ios/Widget, the
 * app's logic (EggTimerApp) and what the app and the widget share
 * (EggTimerShared). Not read: the core (EggTimerCore), which hands the app
 * catalogue keys, never sentences, and what a debug build alone compiles
 * (the part of an `#if DEBUG` before its `#else`, and Screenshots.swift,
 * which acts only on launch arguments a release build never reads).
 *
 * A NOT_COPY entry that no literal read needs fails too, so the list holds
 * only what the code says now.
 *
 * The web half of the words is index.html's `data-copy` (copy.test.ts 6b)
 * and the copy capture (tools/copyScenarios.ts, tools/copySnapshot.ts),
 * which renders the running app. What neither proves: that each key is
 * rendered with the right argument in the right slot, or on the right
 * branch. Those are one-line call sites, reviewed in the diff and built by
 * xcodebuild; the renderer itself is held to the web's by
 * fixtures/copy.json.
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
  // SwiftUI views
  'Text', 'Button', 'Label', 'Toggle', 'Picker', 'TextField', 'SecureField', 'Link', 'ShareLink', 'Menu', 'Section',
  'LabeledContent', 'Stepper', 'NavigationLink', 'ProgressView', 'Gauge', 'DisclosureGroup', 'ContentUnavailableView',
  'AttributedString', 'NSAttributedString',
  // SwiftUI modifiers
  'navigationTitle', 'navigationBarTitle', 'accessibilityLabel', 'accessibilityHint', 'accessibilityValue',
  'accessibilityInputLabels', 'accessibilityAction', 'alert', 'confirmationDialog', 'help', 'badge',
  // UIKit, notifications, and the app's own VoiceOver announcement
  'setTitle', 'UIAlertController', 'UIAlertAction', 'UIAction', 'UIMenu', 'UNNotificationAction', 'announce',
]);

/** Arguments of a text call that name something other than text. */
const NOT_TEXT = new Set([
  'systemImage', 'systemName', 'image', 'named', 'destination', 'url', 'identifier', 'id', 'forKey', 'forInfoDictionaryKey',
  'tag', 'bundle',
  'tableName', 'comment', 'format', 'specifier', 'in', 'for', 'locale', 'language',
]);

/** Properties whose value is drawn or spoken: `x.text = …`. */
const TEXT_PROPERTIES = new Set([
  'text', 'attributedText', 'title', 'subtitle', 'body', 'placeholder', 'prompt', 'accessibilityLabel',
  'accessibilityValue', 'accessibilityHint',
]);

/** The catalogue's renderers (EggTimerShared/Copy.swift): what they return is
 *  copy already, so what they are made of is not read. */
const RENDERERS = new Set(['tr', 'trChosen']);

/** Types a parameter of text has: a string, a list of them, or a Text. */
const TEXT_TYPE = /^\[?(String|Substring|LocalizedStringKey|Text|AttributedString)\]?\??$/;

/** Literals read that have a letter but are not words a cook reads, and
 *  why: none today. */
const NOT_COPY: Record<string, string> = {};

/* ------------------------------------------------------------- the lexer */

type Token =
  | { k: 'id'; text: string }
  | { k: 'p'; text: string }
  | { k: 'nl' }
  | { k: 'str'; text: string; key: boolean; inner: Token[] };

/** Swift source as tokens: identifiers (a backticked one as its name),
 *  punctuation, newlines, and string literals, each with its text (an
 *  interpolation as `{}`), whether a colon follows it at once (a
 *  dictionary key, where a ternary's colon has a space before it), and the
 *  tokens of its interpolations. Comments are dropped. */
function lex(source: string): Token[] {
  let i = 0;
  const run = (until: ')' | null): Token[] => {
    const out: Token[] = [];
    let depth = 0;
    while (i < source.length) {
      const c = source[i];
      if (source.startsWith('//', i)) {
        const end = source.indexOf('\n', i);
        i = end < 0 ? source.length : end;
        continue;
      }
      if (source.startsWith('/*', i)) {
        i = source.indexOf('*/', i) + 2;
        continue;
      }
      if (c === '\n') { out.push({ k: 'nl' }); i += 1; continue; }
      if (/\s/.test(c)) { i += 1; continue; }
      if (c === '"') {
        if (source.startsWith('"""', i)) throw new Error('multi-line literal: extend the lexer');
        out.push(literal());
        continue;
      }
      if (c === '`') {
        const end = source.indexOf('`', i + 1);
        out.push({ k: 'id', text: source.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
      const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i, i + 200));
      if (word !== null) { out.push({ k: 'id', text: word[0] }); i += word[0].length; continue; }
      const two = source.slice(i, i + 2);
      if (['==', '!=', '<=', '>=', '->', '+=', '-=', '&&', '||', '??'].includes(two)) {
        out.push({ k: 'p', text: two });
        i += 2;
        continue;
      }
      if (until !== null && c === '(') depth += 1;
      if (until !== null && c === ')') {
        if (depth === 0) { i += 1; return out; }
        depth -= 1;
      }
      out.push({ k: 'p', text: c });
      i += 1;
    }
    return out;
  };
  const literal = (): Token => {
    let text = '';
    const inner: Token[] = [];
    i += 1;
    while (i < source.length && source[i] !== '"') {
      if (source[i] === '\\' && source[i + 1] === '(') {
        i += 2;
        inner.push(...run(')'));
        text += '{}';
        continue;
      }
      if (source[i] === '\\' && source[i + 1] === 'u' && source[i + 2] === '{') {
        const end = source.indexOf('}', i);
        text += String.fromCodePoint(parseInt(source.slice(i + 3, end), 16));
        i = end + 1;
        continue;
      }
      if (source[i] === '\\') {
        const e = source[i + 1];
        text += e === 'n' ? '\n' : e === 't' ? '\t' : e;
        i += 2;
        continue;
      }
      text += source[i];
      i += 1;
    }
    i += 1;
    return { k: 'str', text: text, key: source[i] === ':', inner: inner };
  };
  return run(null);
}

const isP = (t: Token | undefined, text: string): boolean => t !== undefined && t.k === 'p' && t.text === text;
const OPEN: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

/** The index after the bracket that closes the one at `start`. */
function closing(tokens: Token[], start: number): number {
  const stack: string[] = [];
  for (let j = start; j < tokens.length; j++) {
    const t = tokens[j];
    if (t.k !== 'p') continue;
    if (t.text in OPEN) stack.push(OPEN[t.text]);
    else if (t.text === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return j + 1;
    }
  }
  return tokens.length;
}

/** A call's arguments, between the parentheses at `open`: each with its
 *  label, if it has one, and its tokens after the label. */
function argumentsAt(tokens: Token[], open: number): { label: string | null; tokens: Token[] }[] {
  const end = closing(tokens, open) - 1;
  const args: Token[][] = [[]];
  for (let j = open + 1; j < end; j++) {
    const t = tokens[j];
    if (t.k === 'p' && t.text in OPEN) {
      const after = closing(tokens, j);
      args[args.length - 1].push(...tokens.slice(j, after));
      j = after - 1;
    } else if (isP(t, ',')) {
      args.push([]);
    } else if (t.k !== 'nl') {
      args[args.length - 1].push(t);
    }
  }
  return args.filter((a) => a.length > 0).map((a) => (a[0].k === 'id' && isP(a[1], ':')
    ? { label: a[0].text, tokens: a.slice(2) }
    : { label: null, tokens: a }));
}

/** What a text call, or a text property, can say through. */
interface Sink { labels: Set<string>; positions: Set<number>; any: boolean }

/** The tokens of an expression that reach the screen as text: all of it but
 *  what a closure says, and but a nested call's arguments labelled for
 *  something else. String literals' interpolations are in it too. */
function textTokens(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (let j = 0; j < tokens.length; j++) {
    const t = tokens[j];
    // A closure, or a subscript's key (`info["CFBundleVersion"]`), which
    // looks a value up rather than being one; an array literal follows
    // anything else.
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

/** Every stretch of tokens that reaches the screen in `tokens`: the text
 *  arguments of each call to a sink, and the value given each text
 *  property. */
function textSites(tokens: Token[], sinks: Map<string, Sink>): Token[][] {
  const out: Token[][] = [];
  const walk = (ts: Token[]): void => {
    for (let j = 0; j < ts.length; j++) {
      const t = ts[j];
      if (t.k === 'str') walk(t.inner);
      if (t.k !== 'id') continue;
      const sink = sinks.get(t.text);
      if (sink !== undefined && isP(ts[j + 1], '(') && !isP(ts[j - 1], 'func')) {
        argumentsAt(ts, j + 1).forEach((a, n) => {
          const text = sink.any ? a.label === null || !NOT_TEXT.has(a.label)
            : a.label === null ? sink.positions.has(n) : sink.labels.has(a.label);
          if (text) out.push(textTokens(a.tokens));
        });
      }
      if (TEXT_PROPERTIES.has(t.text) && isP(ts[j - 1], '.') && isP(ts[j + 1], '=')) {
        let end = j + 2;
        while (end < ts.length && ts[end].k !== 'nl') {
          end = isP(ts[end], '(') || isP(ts[end], '[') || isP(ts[end], '{') ? closing(ts, end) : end + 1;
        }
        out.push(textTokens(ts.slice(j + 2, end)));
      }
    }
  };
  walk(tokens);
  return out;
}

/* ------------------------------------------------ the app's own text calls */

interface Param { label: string | null; name: string; position: number; text: boolean }

function paramsAt(tokens: Token[], open: number): Param[] {
  return argumentsAt(tokens, open).map((a, n) => {
    // `_ name: Type`, `label name: Type`, or `name: Type`: argumentsAt took
    // a lone name and its colon as a label.
    const typeOf = (ts: Token[]): string => {
      const eq = ts.findIndex((t) => isP(t, '='));
      return (eq < 0 ? ts : ts.slice(0, eq)).map((t) => (t.k === 'id' || t.k === 'p' ? t.text : '')).join('');
    };
    if (a.label !== null) return { label: a.label, name: a.label, position: n, text: TEXT_TYPE.test(typeOf(a.tokens)) };
    const [outer, inner] = a.tokens;
    const colon = a.tokens.findIndex((t) => isP(t, ':'));
    const type = typeOf(a.tokens.slice(colon + 1));
    const label = outer?.k === 'id' && outer.text !== '_' ? outer.text : null;
    return { label: label, name: inner?.k === 'id' ? inner.text : '', position: n, text: TEXT_TYPE.test(type) };
  });
}

const idsIn = (ts: Token[]): string[] => ts.flatMap((t) => (t.k === 'id' ? [t.text] : t.k === 'str' ? idsIn(t.inner) : []));

/** Whether a name reaches the screen through `sinks` in `body`: itself, or
 *  through what is made from it there, a local `let`, `var` or assignment
 *  from it, a `for` over it, or a closure's parameter given it
 *  (`ForEach(paragraphs) { p in Text(p) }`). */
function reaches(body: Token[], sinks: Map<string, Sink>): (name: string) => boolean {
  const shown = new Set(textSites(body, sinks).flatMap(idsIn));
  const openers = new Map<number, number>();
  const stack: number[] = [];
  body.forEach((t, n) => {
    if (isP(t, '(')) stack.push(n);
    if (isP(t, ')')) openers.set(n, stack.pop() ?? 0);
  });
  /** The expression from `start` to the end of its line, brackets whole. */
  const rest = (start: number, stop: (t: Token) => boolean): Token[] => {
    let end = start;
    while (end < body.length && body[end].k !== 'nl' && !stop(body[end])) {
      end = body[end].k === 'p' && (body[end] as { text: string }).text in OPEN ? closing(body, end) : end + 1;
    }
    return body.slice(start, end);
  };
  return (name) => {
    const tainted = new Set([name]);
    let grew = true;
    while (grew) {
      grew = false;
      const add = (made: string, from: Token[]): void => {
        if (!tainted.has(made) && idsIn(from).some((x) => tainted.has(x))) {
          tainted.add(made);
          grew = true;
        }
      };
      for (let n = 0; n < body.length; n++) {
        const t = body[n];
        const next = body[n + 1];
        if (t.k === 'id' && (isP(next, '=') || isP(next, '+='))) add(t.text, rest(n + 2, () => false));
        if (t.k === 'id' && t.text === 'for' && next?.k === 'id' && body[n + 2]?.k === 'id') {
          add(next.text, rest(n + 3, (x) => isP(x, '{')));
        }
        if (isP(t, '{') && isP(body[n - 1], ')')) {
          const names: string[] = [];
          let m = n + 1;
          while (body[m]?.k === 'id' && (body[m] as { text: string }).text !== 'in') {
            names.push((body[m] as { text: string }).text);
            m += isP(body[m + 1], ',') ? 2 : 1;
          }
          if (body[m]?.k === 'id' && (body[m] as { text: string }).text === 'in') {
            const args = body.slice(openers.get(n - 1) ?? n, n);
            for (const x of names) add(x, args);
          }
        }
      }
    }
    return [...tainted].some((x) => shown.has(x));
  };
}

function addSink(sinks: Map<string, Sink>, name: string, p: Param): boolean {
  const sink = sinks.get(name) ?? { labels: new Set(), positions: new Set(), any: false };
  sinks.set(name, sink);
  const before = sink.labels.size + sink.positions.size;
  if (p.label === null) sink.positions.add(p.position);
  else sink.labels.add(p.label);
  return sink.labels.size + sink.positions.size > before;
}

/** The app's functions, views and inits that pass text on to a text call,
 *  added to `sinks` until nothing more is found. */
function appSinks(files: Token[][], sinks: Map<string, Sink>): void {
  let grew = true;
  while (grew) {
    grew = false;
    for (const tokens of files) {
      for (let j = 0; j < tokens.length; j++) {
        const t = tokens[j];
        if (t.k !== 'id') continue;
        if (t.text === 'func' && tokens[j + 1]?.k === 'id') {
          const name = (tokens[j + 1] as { text: string }).text;
          let open = j + 2;
          if (isP(tokens[open], '<')) while (open < tokens.length && !isP(tokens[open], '(')) open += 1;
          if (!isP(tokens[open], '(')) continue;
          const params = paramsAt(tokens, open).filter((p) => p.text);
          let b = closing(tokens, open);
          while (b < tokens.length && !isP(tokens[b], '{') && tokens[b].k !== 'nl') b += 1;
          if (!isP(tokens[b], '{') || params.length === 0) continue;
          const reach = reaches(tokens.slice(b, closing(tokens, b)), sinks);
          for (const p of params) if (reach(p.name) && addSink(sinks, name, p)) grew = true;
        }
        if (t.text === 'struct' && tokens[j + 1]?.k === 'id') {
          const name = (tokens[j + 1] as { text: string }).text;
          let b = j + 2;
          while (b < tokens.length && !isP(tokens[b], '{')) b += 1;
          const end = closing(tokens, b);
          const body = tokens.slice(b, end);
          const reach = reaches(body, sinks);
          // Stored text properties at the struct's own depth: its memberwise
          // init's labels.
          let depth = 0;
          const props: string[] = [];
          for (let m = 0; m < body.length; m++) {
            const x = body[m];
            if (x.k === 'p' && x.text in OPEN) depth += 1;
            else if (x.k === 'p' && [')', ']', '}'].includes(x.text)) depth -= 1;
            else if (depth === 1 && x.k === 'id' && (x.text === 'let' || x.text === 'var') && body[m + 1]?.k === 'id'
              && isP(body[m + 2], ':')) {
              let e = m + 3;
              let type = '';
              while (e < body.length && body[e].k !== 'nl' && !isP(body[e], '=') && !isP(body[e], '{')) {
                type += (body[e] as { text?: string }).text ?? '';
                e += 1;
              }
              const prop = (body[m + 1] as { text: string }).text;
              if (TEXT_TYPE.test(type) && reach(prop)) props.push(prop);
            }
          }
          for (const prop of props) {
            if (addSink(sinks, name, { label: prop, name: prop, position: -1, text: true })) grew = true;
          }
          // An init's parameter that reaches a text call, or is kept as a
          // text property.
          for (let m = 0; m < body.length; m++) {
            if (!(body[m].k === 'id' && (body[m] as { text: string }).text === 'init' && isP(body[m + 1], '('))) continue;
            const params = paramsAt(body, m + 1).filter((p) => p.text);
            let ib = closing(body, m + 1);
            while (ib < body.length && !isP(body[ib], '{')) ib += 1;
            const initBody = body.slice(ib, closing(body, ib));
            const initReach = reaches(initBody, sinks);
            for (const p of params) {
              const kept = props.some((prop) => initBody.some((x, n) => x.k === 'id' && x.text === prop
                && isP(initBody[n + 1], '=') && initBody[n + 2]?.k === 'id' && (initBody[n + 2] as { text: string }).text === p.name));
              if ((initReach(p.name) || kept) && addSink(sinks, name, p)) grew = true;
            }
          }
        }
      }
    }
  }
}

/* ------------------------------------------- what is shown is made where */

/** The expression from `start` to the end of its line, brackets whole. */
function lineFrom(tokens: Token[], start: number): Token[] {
  let end = start;
  while (end < tokens.length && tokens[end].k !== 'nl') {
    end = tokens[end].k === 'p' && (tokens[end] as { text: string }).text in OPEN ? closing(tokens, end) : end + 1;
  }
  return tokens.slice(start, end);
}

/** The names an expression's value is read from: each name not after a
 *  `.`, and each member read after one, apart. */
function namesIn(ts: Token[]): { heads: string[]; members: string[] } {
  const heads: string[] = [];
  const members: string[] = [];
  ts.forEach((t, n) => {
    if (t.k === 'id') (isP(ts[n - 1], '.') ? members : heads).push(t.text);
    if (t.k === 'str') {
      const inner = namesIn(t.inner);
      heads.push(...inner.heads);
      members.push(...inner.members);
    }
  });
  return { heads: heads, members: members };
}

/** The type written from `k` up to `=`, `{` or the line's end, and where it stops. */
function typeFrom(tokens: Token[], k: number): [string, number] {
  let type = '';
  while (k < tokens.length && tokens[k].k !== 'nl' && !isP(tokens[k], '=') && !isP(tokens[k], '{')) {
    type += (tokens[k] as { text?: string }).text ?? '';
    k += 1;
  }
  return [type, k];
}

/** Where a value is made that a shown name holds: the value given a
 *  `let` or `var` of that name in the same file, or assigned to it there;
 *  and what a function or computed property of that name returns, in any
 *  file, if it returns a string (each `return`, or a body with none, which
 *  is its value). Added to each file's sites until no new name is shown. A
 *  name is matched by spelling, not by scope, which can only read more. */
function madeSites(files: Map<string, Token[]>, sites: Map<string, Token[][]>): void {
  const done = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    const members = new Set<string>();
    const heads = new Map<string, Set<string>>();
    for (const [file, fileSites] of sites) {
      const local = new Set<string>();
      for (const site of fileSites) {
        const n = namesIn(site);
        for (const h of n.heads) { local.add(h); members.add(h); }
        for (const m of n.members) members.add(m);
      }
      heads.set(file, local);
    }
    for (const [file, tokens] of files) {
      const local = heads.get(file) as Set<string>;
      for (let j = 0; j < tokens.length; j++) {
        const t = tokens[j];
        if (t.k !== 'id' || !members.has(t.text) || RENDERERS.has(t.text) || done.has(`${file}:${j}`)) continue;
        const before = tokens[j - 1];
        const keyword = before?.k === 'id' ? before.text : '';
        let made: Token[][] = [];
        if (local.has(t.text) && isP(tokens[j + 1], '=') && !isP(before, '.')) made = [lineFrom(tokens, j + 2)];
        if ((keyword === 'let' || keyword === 'var') && isP(tokens[j + 1], ':')) {
          // `let name: Type = value`, or `var name: String { … }`.
          const [type, k] = typeFrom(tokens, j + 2);
          if (isP(tokens[k], '=') && local.has(t.text)) made = [lineFrom(tokens, k + 1)];
          else if (isP(tokens[k], '{') && TEXT_TYPE.test(type)) made = returned(tokens.slice(k + 1, closing(tokens, k) - 1));
        }
        if (keyword === 'func' && isP(tokens[j + 1], '(')) {
          const k = closing(tokens, j + 1);
          const [type, b] = isP(tokens[k], '->') ? typeFrom(tokens, k + 1) : ['', k];
          if (isP(tokens[b], '{') && TEXT_TYPE.test(type)) made = returned(tokens.slice(b + 1, closing(tokens, b) - 1));
        }
        if (made.length === 0) continue;
        done.add(`${file}:${j}`);
        for (const m of made) (sites.get(file) as Token[][]).push(textTokens(m));
        grew = true;
      }
    }
  }
}

/** What a body returns: each `return`'s expression, or, with none, all of it. */
function returned(body: Token[]): Token[][] {
  const out: Token[][] = [];
  body.forEach((t, n) => {
    if (t.k === 'id' && t.text === 'return') out.push(lineFrom(body, n + 1));
  });
  return out.length > 0 ? out : [body];
}

/* --------------------------------------------------------------- sources */

function swiftFiles(dir: string): string[] {
  return readdirSync(dir).filter((f) => f.endsWith('.swift')).map((f) => join(dir, f));
}

/** `source` with what only a debug build compiles blanked, line for line:
 *  an `#if DEBUG` branch up to its `#elseif` or `#else`, and what follows
 *  the `#elseif` or `#else` of an `#if !DEBUG`. Any other condition
 *  (`os(iOS)`) is scanned on both sides, since a release build may compile
 *  either. */
function releaseOnly(source: string): string {
  const open: { debugOnly: 'before' | 'after' | null; past: boolean }[] = [];
  return source.split('\n').map((line) => {
    const directive = /^\s*#(if|elseif|else|endif)\b\s*(.*?)\s*(\/\/.*)?$/.exec(line);
    if (directive === null) {
      const skipped = open.some((o) => (o.debugOnly === 'before' && !o.past) || (o.debugOnly === 'after' && o.past));
      return skipped ? '' : line;
    }
    const [, word, condition] = directive;
    if (word === 'if') {
      const debugOnly = condition === 'DEBUG' ? 'before' : /^!\s*DEBUG$/.test(condition) ? 'after' : null;
      open.push({ debugOnly: debugOnly, past: false });
    } else if (word === 'endif') {
      open.pop();
    } else {
      const top = open[open.length - 1];
      if (top === undefined) throw new Error(`#${word} outside an #if`);
      top.past = true;
    }
    return '';
  }).join('\n');
}

function sources(): Map<string, Token[]> {
  const files = new Map<string, Token[]>();
  for (const dir of DIRS) {
    for (const name of swiftFiles(dir)) {
      if (!DEBUG_FILES.has(name)) files.set(name, lex(releaseOnly(readFileSync(name, 'utf8'))));
    }
  }
  return files;
}

/** Whether a literal is words: a letter left once its interpolations and
 *  any printf-style number format (`%d`, `%.{}f`) are taken out. */
function isWords(text: string): boolean {
  return /\p{L}/u.test(text.replace(/%[-+ 0#]*(\d+|\{\})?(\.(\d+|\{\}))?(ll|l|h)?[a-zA-Z@]/g, '').replace(/\{\}/g, ''));
}

/* ------------------------------------------------------------------ main */

const en = parseCatalogue(JSON.parse(readFileSync('copy/en.json', 'utf8')));

/** The names of arguments the catalogue takes: `"grams": .int(68)` in a call
 *  is not a word, as long as it is one of these and in key position. */
const argumentNames = new Set([...en.messages.values()]
  .flatMap((m) => templatesOf(m).flatMap(placeholders).concat(m.kind === 'plural' ? [m.count] : [])));

const files = sources();
const sinks = new Map<string, Sink>([...TEXT_CALLS].map((n) => [n, { labels: new Set(), positions: new Set(), any: true }]));
appSinks([...files.values()], sinks);

const sites = new Map([...files].map(([file, tokens]) => [file, textSites(tokens, sinks)]));
madeSites(files, sites);
const located: [string, Token[]][] = [...sites].flatMap(([file, fileSites]) => fileSites.map((site): [string, Token[]] => [file, site]));

const failures: string[] = [];
const needed = new Set<string>();
let read = 0;
for (const [file, site] of located) {
  for (const t of site) {
    if (t.k !== 'str') continue;
    read += 1;
    if (process.argv.includes('--list')) console.log(`${file}: ${JSON.stringify(t.text)}`);
    if (t.key && argumentNames.has(t.text)) continue;
    if (!isWords(t.text)) continue;
    if (t.text in NOT_COPY) { needed.add(t.text); continue; }
    failures.push(`${file}: "${t.text}" is words on a screen; give it a key in copy/en.json`);
  }
}
for (const name of DEBUG_FILES) {
  if (!existsSync(name)) failures.push(`${name} is skipped and is no file; take it off its list`);
}
for (const entry of Object.keys(NOT_COPY)) {
  if (!needed.has(entry)) failures.push(`NOT_COPY: "${entry}" is no literal read that needs it; delete it`);
}

const own = [...sinks.keys()].filter((n) => !TEXT_CALLS.has(n)).sort();
console.log(`${read} literals where Swift's text reaches the screen, through ${TEXT_CALLS.size} of the system's calls `
  + `and ${own.length} of the app's own (${own.join(', ')}).`);
if (failures.length > 0) {
  console.log(`\n${failures.length} failures:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('none of them is words, and every NOT_COPY entry is needed.');
