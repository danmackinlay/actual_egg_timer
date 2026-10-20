/**
 * tools/copyArgs.ts: each Swift `tr` with a literal key is given exactly the
 * key's arguments, so a debug build's assertion in `tr` cannot stop the app;
 * and it reads what it says it reads.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { type Call, callsIn, checkTree, helperKeys, literalKeys, mask, problem } from '../tools/copyArgs.ts';

const names = new Map<string, Set<string>>([
  ['a.none', new Set()],
  ['a.two', new Set(['egg', 'start'])],
  ['a.four', new Set(['egg', 'from', 'start', 'cooling'])],
]);
const problems = (source: string): string[] =>
  callsIn('V.swift', source).map((c: Call) => problem(c, names)).filter((p): p is string => p !== null);

test('every tr in the app is given exactly its key’s arguments', () => {
  const { calls, failures, helpers } = checkTree();
  assert.deepEqual(failures, []);
  assert.ok(calls.filter((c) => c.keys !== null && c.names !== null).length > 200, 'most calls are read');
  // Keys that take arguments, written where no tr reads them: each was read
  // by hand, and one added here is to be read too. The start's limits are
  // rendered by trChosen with the time (InHand.stepStart, SetupSentence).
  assert.deepEqual(helpers.map((h) => h.replace(/:\d+:/, ':')), [
    'ios/EggTimerCore/Sources/EggTimerApp/InHand.swift: controls.startedAt.latestBoil [time]',
    'ios/EggTimerCore/Sources/EggTimerApp/InHand.swift: controls.startedAt.latestPull [time]',
    'ios/EggTimerCore/Sources/EggTimerApp/InHand.swift: controls.startedAt.earliest [time]',
  ]);
});

test('a literal key given other arguments fails, and given its own passes', () => {
  assert.deepEqual(problems('tr(.`a.two`, ["egg": .text(e), "start": .text(s)])'), []);
  assert.equal(problems('tr(.`a.two`, ["egg": .text(e)])').length, 1);
  assert.equal(problems('tr(.`a.two`, ["egg": e, "start": s, "from": f])').length, 1);
  assert.deepEqual(problems('tr(.`a.none`)'), []);
  assert.deepEqual(problems('tr(.`a.none`, in: lang)'), []);
  assert.deepEqual(problems('tr(.`a.none`, [:])'), []);
  assert.equal(problems('tr(.`a.two`)').length, 1);
});

test('the sous-vide sentence as it was: one dictionary, bound by let, given both templates', () => {
  const was = `
    let args: CopyArgs = [
        "egg": .text(Self.mark(.egg)), "from": .text(Self.mark(.from)),
        "start": .text(Self.mark(.start)), "cooling": .text(Self.mark(.cooling)),
    ]
    template = planner.isSousVide ? tr(.\`a.two\`, args) : tr(.\`a.four\`, args)`;
  const found = problems(was);
  assert.equal(found.length, 1);
  assert.match(found[0]!, /a\.two.*given \[cooling, egg, from, start\] and takes \[egg, start\]/);
});

test('a ternary of literal keys is each key; any other key is not read', () => {
  assert.deepEqual(literalKeys('c ? .`a.none` : .`a.two`'), ['a.none', 'a.two']);
  assert.deepEqual(literalKeys('p ? .`a` : o ? .`b` : .`c`'), ['a', 'b', 'c']);
  assert.equal(literalKeys('r.primary ?? .`a.none`'), null);
  assert.equal(literalKeys('anchor.key'), null);
  assert.equal(problems('Text(tr(open ? .`a.none` : .`a.two`))').length, 1);
  assert.deepEqual(problems('tr(key, ["x": y])'), []);
});

test('multi-line calls, nested calls and calls inside an interpolation are read', () => {
  assert.equal(problems('tr(.`a.two`, [\n  "egg": .text(tr(.`a.none`)),\n  "start": .text("x"),\n])').length, 0);
  assert.equal(problems('tr(.`a.two`, ["egg": .text(tr(.`a.two`))])').length, 2);
  assert.equal(problems('let s = "\\(n) \\(tr(.`a.two`))"').length, 1);
});

test('comments and the words in strings are not read as calls', () => {
  assert.deepEqual(problems('// tr(.`a.two`)\n/* tr(.`a.two`) */\nlet s = "tr(.`a.two`)"'), []);
  assert.equal(mask('a "b\\"c" d').length, 'a "b\\"c" d'.length);
  assert.equal(mask('x = #"a"b"# + "\\(y)"'), 'x = #"   "# + "  y "');
});

test('trChosen with a literal key fails; a CopyRef may give fewer, never another', () => {
  assert.equal(problems('trChosen(.`a.two`, ["egg": e, "start": s])').length, 1);
  assert.deepEqual(problems('CopyRef(.`a.two`, ["egg": 1])'), []);
  assert.equal(problems('CopyRef(.`a.two`, ["weeks": 1])').length, 1);
});

test('a key taking arguments handed to a helper is listed to read by hand', () => {
  assert.deepEqual(helperKeys('V.swift', 'InfoRow(.`a.two`)\nText(tr(.`a.two`, ["egg": e, "start": s]))', names), [
    'V.swift:1: a.two [egg, start]',
  ]);
});
