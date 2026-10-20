/**
 * The catalogue's writer (tools/copyFile.ts): every file in copy/ is in the
 * layout it writes, and an edit changes the lines of the keys it changes and
 * no others.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { entryLine, entryLines, jsonString, withEntries } from '../tools/copyFile.ts';
import { OVERLAYS } from '../src/core/copy.ts';

const text = (tag: string): string => readFileSync(`copy/${tag}.json`, 'utf8');
const EN = text('en');
const US = text('en-US');
const ORDER = entryLines(EN).entries.map((e) => e.key);

/** The lines that differ, as [before, after], the files' lengths apart. */
function changed(a: string, b: string): [string, string][] {
  const x = a.split('\n');
  const y = b.split('\n');
  assert.equal(x.length, y.length, 'the same number of lines');
  return x.map((l, i) => [l, y[i]] as [string, string]).filter(([l, m]) => l !== m);
}

test('every catalogue the editor writes is in the writer\'s layout: each line written again is itself', () => {
  // The English and its overlays; the 1750 twin is read-only there, and a few
  // of its lines are laid out otherwise, which the writer would not touch.
  for (const tag of ['en', ...OVERLAYS]) {
    const t = text(tag);
    const { lines, entries } = entryLines(t);
    assert.ok(entries.length > 0, tag);
    for (const e of entries) assert.equal(entryLine(e.key, e.entry) + (e.comma ? ',' : ''), lines[e.index], `${tag} ${e.key}`);
    assert.equal(withEntries(t, new Map(), ORDER), t, tag);
  }
});

test('an edit to one key changes its line and no other', () => {
  const edited = withEntries(EN, new Map([['action.startAgain', { text: 'Words from a test' }]]), ORDER);
  assert.deepEqual(changed(EN, edited).map(([, b]) => b), ['    "action.startAgain": { "text": "Words from a test" },']);
  // The last key keeps its line without a comma.
  const last = ORDER.at(-1) as string;
  const end = withEntries(EN, new Map([[last, { text: 'The last words from a test' }]]), ORDER);
  assert.deepEqual(changed(EN, end).map(([, b]) => b), [`    ${jsonString(last)}: { "text": "The last words from a test" }`]);
  // A plural keeps its fields in their order.
  const plural = withEntries(EN, new Map([['learned.tuned', { count: 'eggs', one: 'From {eggs} test result', other: 'From {eggs} test results' }]]), ORDER);
  assert.deepEqual(changed(EN, plural).map(([, b]) => b),
    ['    "learned.tuned": { "count": "eggs", "one": "From {eggs} test result", "other": "From {eggs} test results" },']);
});

test('the space no reader sees is written as the escape the files have', () => {
  assert.equal(jsonString('{value}\u00a0L'), '"{value}\\u00a0L"');
  assert.equal(jsonString('I’m — 4 °C × 2'), '"I’m — 4 °C × 2"', 'what a reader sees is written as it is');
  // An entry with a no-break space (a measure's), written again as the file
  // has it: read, not quoted, so a change of wording moves no test.
  const spaced = entryLines(EN).entries.find((e) => Object.values(e.entry).some((v) => v.includes('\u00a0')));
  assert.ok(spaced !== undefined, 'a measure parts its number and unit with a no-break space');
  const again = withEntries(EN, new Map([[spaced.key, { ...spaced.entry }]]), ORDER);
  assert.equal(again, EN, 'the same words, the same file');
});

test('a US line added goes in the English order, and taken away again leaves the file as it was', () => {
  const after = ORDER[ORDER.indexOf('action.hint.cold') + 1];
  const added = withEntries(US, new Map([[after, { base: 'x', text: 'y' }]]), ORDER);
  const keys = entryLines(added).entries.map((e) => e.key);
  assert.equal(keys[keys.indexOf('action.hint.cold') + 1], after);
  assert.equal(withEntries(added, new Map([[after, null]]), ORDER), US);
  // First and last, and every line taken away: still a catalogue.
  const first = withEntries(US, new Map([[ORDER[0], { base: 'a', text: 'b' }]]), ORDER);
  assert.equal(entryLines(first).entries[0].key, ORDER[0]);
  const none = withEntries(US, new Map(entryLines(US).entries.map((e) => [e.key, null])), ORDER);
  assert.deepEqual((JSON.parse(none) as { messages: object }).messages, {});
  const back = withEntries(none, new Map(entryLines(US).entries.map((e) => [e.key, e.entry])), ORDER);
  assert.equal(back, US, 'put back, line by line');
});

test('a key taken from a group leaves one blank line between the groups', () => {
  const groups = '{\n  "locale": "en-US",\n  "messages": {\n    "a": { "text": "A" },\n\n    "b": { "text": "B" },\n\n'
    + '    "c": { "text": "C" }\n  }\n}\n';
  const order = ['a', 'b', 'c'];
  const lines = groups.split('\n').length;
  // Alone between two groups: the blank lines either side become one.
  assert.equal(withEntries(groups, new Map([['b', null]]), order),
    '{\n  "locale": "en-US",\n  "messages": {\n    "a": { "text": "A" },\n\n    "c": { "text": "C" }\n  }\n}\n');
  // Alone first or last: its blank line goes with it, and the commas follow.
  assert.equal(withEntries(groups, new Map([['a', null]]), order).split('\n').length, lines - 2);
  assert.equal(withEntries(groups, new Map([['c', null]]), order),
    '{\n  "locale": "en-US",\n  "messages": {\n    "a": { "text": "A" },\n\n    "b": { "text": "B" }\n  }\n}\n');
});

test('the writer refuses a key the English lacks, and a file it cannot keep', () => {
  assert.throws(() => withEntries(US, new Map([['no.such.key', { base: 'a', text: 'b' }]]), ORDER), /not an English key/);
  assert.throws(() => entryLines('{\n  "locale": "en",\n  "messages": {\n    "a": {\n      "text": "x" }\n  }\n}\n'), /not one entry/);
});
