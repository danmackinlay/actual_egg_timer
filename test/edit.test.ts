/**
 * The web's map of its controls onto the correction in hand (src/ui/edit.ts),
 * checked against index.html without a browser, as test/dom.test.ts checks
 * the elements: every field either makes its group of the cook's choices or
 * is listed as making none, so none is taken for a setting unseen; and the
 * thermometer's reading, the switches and the buttons are the controls they
 * are.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { BUTTONS, FIELD_GROUPS, GROUPLESS } from '../src/ui/edit.ts';

const HTML = readFileSync('index.html', 'utf8');

/** An attribute of a tag's text, or null. */
function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m === null ? null : m[1];
}

/** Every field on the page, as the tables key it: a radio by its name,
 *  anything else by its id. */
function pageFields(): string[] {
  const out = new Set<string>();
  for (const m of HTML.matchAll(/<(?:input|select|output|textarea)\b[^>]*>/g)) {
    const key = attr(m[0], 'type') === 'radio' ? attr(m[0], 'name') : attr(m[0], 'id');
    assert.ok(key !== null, `a field with no id or name: ${m[0]}`);
    out.add(key);
  }
  return [...out];
}

/** Every field `readInputs` reads (src/ui/input.ts): `page().x`, and a
 *  radio group by `radioValue('name', …)`. */
function readFields(): string[] {
  const source = readFileSync('src/ui/input.ts', 'utf8');
  const start = source.indexOf('function readInputs(');
  const body = source.slice(start, source.indexOf('\n}\n', start));
  const out = new Set<string>();
  for (const m of body.matchAll(/page\(\)\.(\w+)/g)) out.add(m[1]);
  for (const m of body.matchAll(/radioValue\('(\w+)'/g)) out.add(m[1]);
  return [...out];
}

test('every field on the page, and every one readInputs reads, makes its group or is listed as making none', () => {
  const read = readFields();
  assert.ok(read.includes('eggCount') && read.includes('cooling'), 'readInputs found');
  for (const key of new Set([...pageFields(), ...read])) {
    const grouped = key in FIELD_GROUPS;
    const groupless = key in GROUPLESS;
    assert.ok(grouped !== groupless, `#${key}: ${grouped ? 'in both tables' : 'in neither table'}`);
  }
  for (const key of [...Object.keys(FIELD_GROUPS), ...Object.keys(GROUPLESS)]) {
    assert.ok(pageFields().includes(key), `#${key} is listed and not on the page`);
  }
});

test('the thermometer\'s reading, the switches and the buttons are the controls they are', () => {
  assert.equal(GROUPLESS['probeReading'], 'probe');
  const checks = [...HTML.matchAll(/<label\b[^>]*class="check"[^>]*>\s*<input\b[^>]*>/g)].map((m) => attr(m[0].slice(m[0].indexOf('<input')), 'id'));
  assert.ok(checks.length >= 2, `.check: ${checks.join(', ')}`);
  for (const id of checks) assert.equal(id !== null ? GROUPLESS[id] : null, 'setting', `.check #${id}`);
  assert.equal(BUTTONS['primary'], 'primary');
  assert.equal(BUTTONS['secondary'], 'cancel');
  assert.equal(BUTTONS['stillOut'], 'stillInWater');
  for (const id of Object.keys(BUTTONS)) assert.match(HTML, new RegExp(`<button\\b[^>]*\\sid="${id}"`), `#${id}`);
});
