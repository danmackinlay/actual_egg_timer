/**
 * The iOS app writes UserDefaults only through `Stores` (ios/App/Store.swift),
 * which a build that finds a newer build's mark turns read-only: a write
 * anywhere else would go round that guard. So outside Store.swift no Swift
 * in the app, its shared code or its widget sets or removes a default
 * itself; it calls `Stores.set` and `Stores.remove`.
 *
 * Read from the source, comments left out: a call to UserDefaults' setters
 * (`set(_:forKey:)`, `setValue(_:forKey:)`) on anything but `Stores`, or to
 * `removeObject`, `setPersistentDomain` or `removePersistentDomain`.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['ios/App', 'ios/Shared', 'ios/Widget'];
const GUARD = 'ios/App/Store.swift';

/** The Swift source with its comments blanked, line breaks kept. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '');
}

/** Each write to UserDefaults in `source` that is not through `Stores`:
 *  its line and what it calls. */
function directWrites(source: string): { line: number; call: string }[] {
  const text = code(source);
  const found: { line: number; call: string }[] = [];
  const lineOf = (at: number) => text.slice(0, at).split('\n').length;
  for (const m of text.matchAll(/([\w.]+)\.(set|setValue)\s*\([^{};]{0,300}?\bforKey\s*:/g)) {
    if (m[1] !== 'Stores') found.push({ line: lineOf(m.index), call: `${m[1]}.${m[2]}` });
  }
  for (const m of text.matchAll(/\b(removeObject|setPersistentDomain|removePersistentDomain)\s*\(/g)) {
    found.push({ line: lineOf(m.index), call: m[1] ?? '' });
  }
  return found;
}

function swiftFiles(): string[] {
  return ROOTS.flatMap((root) =>
    readdirSync(root, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.swift'))
      .map((f) => join(root, f)));
}

test('the lint finds a direct write, and not one through Stores', () => {
  assert.deepEqual(directWrites('UserDefaults.standard.set(next.rawValue, forKey: Self.key)'),
    [{ line: 1, call: 'UserDefaults.standard.set' }]);
  assert.deepEqual(directWrites('let d = UserDefaults.standard\nd.set(Double(x), forKey: "k")'),
    [{ line: 2, call: 'd.set' }]);
  assert.deepEqual(directWrites('defaults.removeObject(forKey: k)'), [{ line: 1, call: 'removeObject' }]);
  assert.deepEqual(directWrites('Stores.set(data, forKey: key)\nStores.remove(key)'), []);
  assert.deepEqual(directWrites('// UserDefaults.standard.set(x, forKey: k)\n/* d.removeObject(forKey: k) */'), []);
});

test('outside Store.swift, every write to UserDefaults goes through Stores', () => {
  const files = swiftFiles();
  assert.ok(files.includes(GUARD), `${GUARD} is where the guard is`);
  const offending = files
    .filter((f) => f !== GUARD)
    .flatMap((f) => directWrites(readFileSync(f, 'utf8')).map((w) => `${f}:${w.line} ${w.call}`));
  assert.deepEqual(offending, [], 'write through Stores.set or Stores.remove');
});
