/**
 * The iOS debug log's events, as the scripted checks type them
 * (`Event` in tools/iosHarness.ts), are the app's (`Screenshots.Event`, in
 * ios/EggTimerCore/Sources/EggTimerApp/Screenshots.swift): the same cases,
 * each with the same fields, a field that may be none optional in both,
 * and a number, a text or a flag the same in both. A case renamed or
 * dropped, or a field, in the Swift fails here rather than leaving
 * `npm run ios:e2e` waiting for an event that never comes.
 *
 * Both read from their source, comments left out.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Field = { optional: boolean; kind: string | null };
type Cases = Map<string, Map<string, Field>>;

const SWIFT_SCALARS: Record<string, string> = { Double: 'number', Int: 'number', String: 'string', Bool: 'boolean' };
const TS_SCALARS = new Set(['number', 'string', 'boolean']);

function uncommented(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** `text` split at each `sep` outside brackets, braces and parentheses. */
function splitTop(text: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === sep && depth === 0) {
      parts.push(text.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(text.slice(from));
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

/** `Screenshots.Event`'s cases, each with its labelled values. */
function swiftEvents(source: string): Cases {
  const text = uncommented(source);
  const start = text.indexOf('public enum Event: Codable, Equatable {');
  assert.ok(start >= 0, 'Screenshots.swift declares `public enum Event: Codable, Equatable`');
  const body = text.slice(start, text.indexOf('\n    }\n', start));
  const cases: Cases = new Map();
  for (const m of body.matchAll(/\bcase\s+(\w+)\s*(?:\(([^)]*)\))?/g)) {
    const fields = new Map<string, Field>();
    for (const param of splitTop(m[2] ?? '', ',')) {
      const [label, type] = param.split(/:\s*/, 2).map((s) => s.trim());
      const optional = type.endsWith('?');
      fields.set(label, { optional, kind: SWIFT_SCALARS[optional ? type.slice(0, -1) : type] ?? null });
    }
    cases.set(m[1], fields);
  }
  return cases;
}

/** iosHarness.ts's `Event`: each member of its union, by its `ev`, with
 *  the rest of its fields. */
function harnessEvents(source: string): Cases {
  const text = uncommented(source);
  const head = 'export type Event = { t: number } & (';
  const start = text.indexOf(head);
  assert.ok(start >= 0, `iosHarness.ts declares \`${head}\``);
  const union = text.slice(start + head.length, text.indexOf('\n);', start));
  const cases: Cases = new Map();
  for (const member of splitTop(union, '|')) {
    assert.ok(member.startsWith('{') && member.endsWith('}'), `a member of Event is an object type: ${member}`);
    const fields = new Map<string, Field>();
    let ev = '';
    for (const field of splitTop(member.slice(1, -1), ';')) {
      const m = /^(\w+)(\??):\s*([\s\S]+)$/.exec(field);
      assert.ok(m, `a field of Event reads: ${field}`);
      const [, name, q, type] = m;
      if (name === 'ev') ev = /^'(\w+)'$/.exec(type)?.[1] ?? '';
      else fields.set(name, { optional: q === '?', kind: TS_SCALARS.has(type) ? type : null });
    }
    assert.ok(ev !== '', `a member of Event names its ev: ${member}`);
    cases.set(ev, fields);
  }
  return cases;
}

test('the readers read a case, its fields, what may be none, and its scalars', () => {
  const swift = swiftEvents(`public enum Event: Codable, Equatable {
        /// A plan taken.
        case plan(
            pull: Double, cooled: Double?, cook: [String?]
        )
        case settled
    }
`);
  assert.deepEqual([...swift.keys()], ['plan', 'settled']);
  assert.deepEqual(Object.fromEntries(swift.get('plan') ?? []), {
    pull: { optional: false, kind: 'number' }, cooled: { optional: true, kind: 'number' },
    cook: { optional: false, kind: null },
  });
  const ts = harnessEvents(`export type Event = { t: number } & (
  | { ev: 'plan'; pull: number; cooled?: number; cook: (string | null)[] }
  | { ev: 'pending'; alarms: { id: string; at?: number }[] }
);`);
  assert.deepEqual(Object.fromEntries(ts.get('plan') ?? []), Object.fromEntries(swift.get('plan') ?? []));
  assert.deepEqual([...(ts.get('pending')?.keys() ?? [])], ['alarms']);
});

test("the harness's events are the app's, field for field", () => {
  const swift = swiftEvents(readFileSync('ios/EggTimerCore/Sources/EggTimerApp/Screenshots.swift', 'utf8'));
  const ts = harnessEvents(readFileSync('tools/iosHarness.ts', 'utf8'));
  assert.deepEqual([...ts.keys()].sort(), [...swift.keys()].sort(), 'the same cases');
  for (const [ev, fields] of swift) {
    assert.deepEqual(Object.fromEntries(ts.get(ev) ?? []), Object.fromEntries(fields), `${ev}'s fields`);
  }
});
