/**
 * The egg page as plain data (`view`, src/ui/view.ts): what the screen
 * shows for a model at a moment, idle, in sous-vide, between a change to the
 * controls and its solve, in each phase of a cook, at Done with its
 * questions, and while the plan asks whether the egg is still in the water.
 * The models are made as the page makes them, through `update`
 * (src/ui/model.ts), with the surfaces a cook wants built at once.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseCatalogue } from '../src/core/copy.js';
import { targetPeakYolk_C } from '../src/core/slider.js';
import { CookSurface } from '../src/core/running.js';
import { forceFormatLocale, t, useCatalogue } from '../src/ui/copy.js';
import { formatClock } from '../src/ui/countdown.js';
import { Model, Msg, update } from '../src/ui/model.js';
import { emptyModel } from '../src/ui/state.js';
import { DEFAULT_SETTINGS, Settings } from '../src/ui/store.js';
import { useUnits } from '../src/ui/units.js';
import { View, view, viewMemo } from '../src/ui/view.js';
import { gridFor, knowing } from '../tools/common.js';

useCatalogue(parseCatalogue(JSON.parse(readFileSync('copy/en.json', 'utf8'))));
forceFormatLocale('en-GB');
useUnits('metric');

const S = 1791363600;
const C = knowing({ particles: 200, eggsLogged: 3, taste: 0.1 });

/** A page on the settings `over`, solved. */
function page(over: Partial<Settings> = {}, boilMemory: Model['boilMemory'] = {}): Model {
  const settings = { ...DEFAULT_SETTINGS, ...over };
  const m: Model = {
    ...emptyModel(), settings: settings, controls: { ...settings }, boilMemory: boilMemory, calib: C,
    appVersion: '0.5.0-alpha.1', prior: 'test',
  };
  return go(m, { kind: 'solve' }, S);
}

function go(m: Model, msg: Msg, now_s: number): Model {
  return update(m, msg, now_s * 1000)[0];
}

/** `m` with every surface it wants built - the idle pot's, the cook's - and
 *  the page told. */
function built(m: Model, now_s: number): Model {
  let next = m;
  for (let i = 0; i < 4; i++) {
    const [, effects] = update(next, { kind: 'solve' }, now_s * 1000);
    const wanted = [
      ...effects.flatMap((e) => (e.kind === 'askSurface' ? [e.inputs] : [])),
      ...(next.need.surface === null ? [] : [next.need.surface]),
    ];
    if (wanted.length === 0) return next;
    const surfaces: CookSurface[] = wanted.map((inputs) => ({ inputs: inputs, grid: gridFor(C, inputs.egg, inputs.setup), profile: null }));
    next = { ...next, surfaces: [...next.surfaces, ...surfaces] };
    next = go(next, { kind: next.cook === null ? 'solve' : 'landed' }, now_s);
  }
  return next;
}

function screen(v: View): Extract<View, { kind: 'idle' | 'running' | 'sous' }> {
  assert.ok(v.kind === 'idle' || v.kind === 'running' || v.kind === 'sous', `a screen with a time on it, not ${v.kind}`);
  return v;
}

test('1. idle: the solve\'s time and Eggs in, the welcome before anything is learned, the egg aimed for', () => {
  const m = page({ startMode: 'hot' });
  const v = screen(view(m, S * 1000, viewMemo()));
  assert.equal(v.kind, 'idle');
  assert.ok(m.solution !== null);
  assert.equal(v.readout.phase, 'IDLE');
  assert.equal(v.readout.words.digits, formatClock(m.solution.result.cookTime_s));
  assert.equal(v.readout.words.primary, t('action.eggsIn'));
  assert.equal(v.readout.feedback, false);
  assert.equal(v.certainty, null, 'no surface yet: nothing to say of how sure');
  assert.equal(v.height, 'hold', 'the readout holds its height while the surface is on its way');
  assert.equal(v.welcome, false, 'three eggs learned: no welcome');
  const fresh = { ...m, calib: knowing({ particles: 200, eggsLogged: 0 }) };
  assert.equal(screen(view(fresh, S * 1000, viewMemo())).welcome, true, 'nothing learned in this kitchen yet');
  assert.equal(v.section?.reading, 'aim');
  assert.equal(v.startedAt, null);

  const decided = built(m, S);
  assert.ok(decided.chosen !== null, 'the surface in, the time decided');
  const w = screen(view(decided, S * 1000, viewMemo()));
  assert.ok(w.certainty !== null && w.certainty.word !== '', 'how sure, in words');
  assert.equal(w.height, 'measure');
  assert.equal(view(decided, S * 1000, viewMemo()).kind, 'idle', 'the same model, the same view');
  assert.deepEqual(view(decided, S * 1000, viewMemo()), view(decided, S * 1000, viewMemo()));
});

test('2. a change to the controls: only the reading, the boiling point, the start and the sentence until it is solved', () => {
  const m = page({ startMode: 'hot' });
  const moved = go(m, { kind: 'controls', controls: { ...m.controls, doneness: 0.7, startMode: 'cold' }, group: null, real_ms: 0 }, S);
  const v = view(moved, S * 1000, viewMemo());
  assert.equal(v.kind, 'unsolved');
  if (v.kind !== 'unsolved') return;
  assert.deepEqual(v.reading, { level: 0.7, peakYolk_C: targetPeakYolk_C(0.7) });
  assert.equal(v.start, 'cold');
  const solved = go(moved, { kind: 'solve' }, S);
  assert.equal(view(solved, S * 1000, viewMemo()).kind, 'idle');
  assert.equal(solved.settings.startMode, 'cold', 'the settings follow the controls while idle');
  assert.notEqual(solved.controls, solved.settings, 'and are not the same object');
});

test('3. sous-vide: the bath\'s start time, a bare track, no button and no odds', () => {
  const m = page({ startMode: 'sous' });
  const v = screen(view(m, S * 1000, viewMemo()));
  assert.equal(v.kind, 'sous');
  assert.equal(v.scale, 'bare');
  assert.equal(v.readout.words.primary, null);
  assert.equal(v.readout.words.label, t('readout.phase.startTime'));
  assert.ok(v.readout.warning !== '');
  assert.equal(v.certainty, null);
  assert.equal(v.learning, false);
  assert.ok('bath_C' in v.reading);
});

test('4. a cold cook in each phase: Heating, Cooking, the pull, the cooling, Done and its questions', () => {
  let m = built(page({ startMode: 'cold', cooling: 'ice' }, { '2.0': 480 }), S);
  m = go(m, { kind: 'begin', units: 'metric', lang: 'en' }, S);
  m = built(m, S + 1);
  assert.ok(m.cook !== null && m.plan !== null);
  const memo = viewMemo();
  const at = (now_s: number): Extract<View, { kind: 'idle' | 'running' | 'sous' }> => {
    const v = view(m, now_s * 1000, memo);
    assert.equal(v.kind, 'running');
    return v as Extract<View, { kind: 'idle' | 'running' | 'sous' }>;
  };

  const heating = at(S + 10);
  assert.equal(heating.readout.phase, 'HEATING');
  assert.equal(heating.readout.words.primary, t('action.fullBoil'));
  assert.equal(heating.readout.hintInfo, true, 'the full rolling boil has its (i)');
  assert.equal(heating.readout.words.secondaryVisible, true, 'Cancel');
  assert.ok(heating.startedAt !== null, 'when the eggs went in, in the start\'s panel');
  assert.equal(heating.section?.reading, 'live');

  m = built(go(m, { kind: 'primary' }, S + 400), S + 401);
  assert.equal(at(S + 410).readout.phase, 'COOKING');
  const pull = m.plan!.deadlines.cookEnd_s;
  m = go(m, { kind: 'tick' }, pull + 1);
  assert.equal(at(pull + 1).readout.phase, 'PULL');
  m = go(m, { kind: 'primary' }, pull + 2);
  assert.equal(at(pull + 3).readout.phase, 'COOLING');
  const coolEnd = m.plan!.deadlines.coolEnd_s!;
  m = go(m, { kind: 'tick' }, coolEnd + 1);
  const done = at(coolEnd + 1);
  assert.equal(done.readout.phase, 'DONE');
  assert.equal(done.readout.feedback, true, 'the questions');
  assert.ok(done.readout.target !== null && done.readout.target !== '', 'and what the yolk is graded against');
  assert.ok(done.readout.notes !== null && done.readout.notes.eggs === C.eggsLogged);
  assert.equal(done.readout.words.primary, t('action.startAgain'));
  assert.equal(done.section?.reading, 'ran', 'the egg as it ran');
  assert.equal(done.certainty, null, 'nothing more to say of a time that has passed');

  const after = go({ ...m, storedId_ms: m.cook!.id_ms }, { kind: 'answered', yolkWord: 'jammy', white: null, probe: null }, coolEnd + 5);
  const answered = view(after, (coolEnd + 5) * 1000, memo);
  assert.equal(answered.kind, 'running');
  if (answered.kind === 'running') assert.equal(answered.readout.notes, null, 'what was said stays said');
});

test('5. the question: past the grace and corrected, "still in the water?" holds Done back', () => {
  let m = built(page({ startMode: 'hot', cooling: 'ice' }), S);
  m = built(go(m, { kind: 'begin', units: 'metric', lang: 'en' }, S), S + 1);
  const pull = m.plan!.deadlines.cookEnd_s;
  m = go(m, { kind: 'tick' }, pull + 25);
  m = go(m, { kind: 'correct', choices: { ...m.cook!.choices, startMode: 'cold' }, startedAt_s: null }, pull + 30);
  const v = view(m, (pull + 40) * 1000, viewMemo());
  assert.equal(v.kind, 'running');
  if (v.kind !== 'running') return;
  assert.equal(v.readout.words.asking, true);
  assert.equal(v.readout.words.label, t('ask.stillIn'));
  assert.equal(v.readout.words.primary, t('ask.stillIn.yes'));
  assert.equal(v.readout.feedback, false, 'no questions past it');
  assert.equal(v.whiteRisk, false, 'no caveat about the pull it doubts');
  assert.equal(v.readout.announce.text, v.readout.words.spoken, 'the question is its own announcement');
});
