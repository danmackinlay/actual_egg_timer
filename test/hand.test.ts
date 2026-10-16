/**
 * The correction in hand (src/core/hand.ts): each sequence of
 * fixtures/hand.json commits what it says, as either app sends it, and the
 * level after the pull only previews. fixtures/hand.json holds iOS to the
 * same steps; what is checked here is the reasoning.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { handChoices, handStep, nothingInHand, previewCook, startStepped } from '../src/core/hand.ts';
import { startCook, withBoil, writeEvents } from '../src/core/running.ts';
import { SEQUENCES, commitsOf, replay } from '../tools/fixtures/hand.ts';
import { BASE_CHOICES, MEMORY, START_S } from '../tools/fixtures/shared.ts';

const S = START_S;
const cold = startCook(S, BASE_CHOICES, 0, MEMORY, 'metric', 'en');
const tapped = withBoil(cold, S + 500);
const pulled = writeEvents(tapped, { ...tapped.events, pulled: { due_s: S + 850, out_s: S + 858, by: 'cook', confirmed: true } });
const said = { ...BASE_CHOICES, level: 0.9, eggCount: 5 };

test('each sequence commits what it says, as the app it names sends it', () => {
  for (const q of SEQUENCES) assert.deepEqual(commitsOf(replay(q.events)), q.commits, q.note);
});

test('the drifts the apps once had: each pair of ways to send the same gestures commits alike', () => {
  const byNote = (start: string): string[] => {
    const q = SEQUENCES.filter((s) => s.note.startsWith(start));
    assert.ok(q.length >= 2, start);
    return q.map((s) => JSON.stringify(s.commits));
  };
  for (const start of ['a long press on a radio', 'a size, then a weight']) {
    const made = byNote(start);
    assert.ok(made.every((m) => m === made[0]), start);
  }
});

test('a timer that comes round late, after its moment has passed, does no more than it would have', () => {
  const at = handStep(nothingInHand(), { kind: 'change', at_s: 0, group: 'eggCount' });
  const committed = handStep(at.state, { kind: 'timer', at_s: 1.5, timer: 'settle' });
  assert.equal(committed.commit, 'eggCount');
  assert.equal(handStep(committed.state, { kind: 'timer', at_s: 9, timer: 'settle' }).commit, null);
  const letGo = handStep(committed.state, { kind: 'timer', at_s: 9, timer: 'hold' });
  assert.equal(letGo.aim, 'letGo');
  assert.equal(handStep(letGo.state, { kind: 'timer', at_s: 10, timer: 'hold' }).aim, null);
});

test('after the pull a level only previews: nothing committed for it, and another group keeps the cook\'s level', () => {
  assert.equal(handChoices(pulled, said, 'level'), null);
  assert.deepEqual(handChoices(pulled, said, 'eggCount'), { ...BASE_CHOICES, eggCount: 5 });
  assert.deepEqual(handChoices(tapped, said, 'level'), { ...BASE_CHOICES, level: 0.9 });
  const preview = previewCook(pulled, said, 'level', S, S + 900);
  assert.equal(preview.events.pulled, null);
  assert.equal(preview.choices.level, 0.9);
  assert.equal(previewCook(tapped, said, 'level', S, S + 900).log.length, tapped.log.length + 1);
});

test('the start steps a minute and stops at now, the boil, the pull and the earliest, saying which', () => {
  assert.deepEqual(startStepped(cold, S, true, S + 30), { start_s: S + 30, limit: { kind: 'now', at_s: S + 30 } });
  assert.deepEqual(startStepped(tapped, S + 480, true, S + 900), { start_s: S + 500, limit: { kind: 'boil', at_s: S + 500 } });
  const out = writeEvents(cold, { ...cold.events, pulled: { due_s: S + 850, out_s: S + 858, by: 'cook', confirmed: true } });
  assert.equal(startStepped(out, S + 800, true, S + 900).limit?.kind, 'pull');
  assert.deepEqual(startStepped(cold, S, false, S + 30), { start_s: S - 60, limit: null });
  assert.equal(startStepped(cold, S - 7170, false, S + 30).limit?.kind, 'earliest');
});
