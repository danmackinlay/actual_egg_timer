/**
 * What each message does to the web's model (`update`, src/ui/model.ts): one
 * test or more for every kind of message the page sends, each a model and a
 * message in, the model and what the page must do out. `update` is pure, so
 * nothing here needs a page; the surfaces a cook wants are built here as the
 * worker would build them. The running cook's own rules are core's
 * (test/step.test.ts); what the web adds around them is test/model.test.ts's
 * too.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CookSurface } from '../src/core/running.ts';
import { type HandEvent, type HandGroup, nothingInHand } from '../src/core/hand.ts';
import { type Effect, type Model, type Msg, update } from '../src/ui/model.ts';
import { controlsOf, emptyModel, settingsOfChoices, sizeClasses } from '../src/ui/state.ts';
import { DEFAULT_SETTINGS, type Settings } from '../src/ui/store.ts';
import { gridFor, knowing } from '../tools/common.ts';

const S = 1791363600;
const C = knowing({ particles: 200, eggsLogged: 4, taste: 0.1 });

/** An idle page on the settings `over`, nothing solved yet. */
function idle(over: Partial<Settings> = {}): Model {
  const settings = { ...DEFAULT_SETTINGS, ...over };
  return {
    ...emptyModel(), settings: settings, boilMemory: { '2.0': 480 }, calib: C,
    appVersion: '0.5.0-alpha.1', prior: 'test',
  };
}

function go(m: Model, msg: Msg, now_s: number): [Model, Effect[]] {
  return update(m, msg, now_s * 1000);
}

function kinds(effects: Effect[]): string[] {
  return effects.map((e) => e.kind);
}

/** `m` with every surface its cook waits for built, and landed. */
function landed(m: Model, now_s: number): Model {
  let next = m;
  for (let i = 0; i < 4 && next.need.surface !== null; i++) {
    const inputs = next.need.surface;
    const surface: CookSurface = { inputs: inputs, grid: gridFor(C, inputs.egg, inputs.setup), profile: null };
    next = go({ ...next, surfaces: [...next.surfaces, surface] }, { kind: 'landed' }, now_s)[0];
  }
  return next;
}

/** A cook begun at S on the settings `over`, its surface in; built once
 *  per settings and shared, since a model is never changed in place. */
const cooks = new Map<string, Model>();
function running(over: Partial<Settings> = { startMode: 'hot' }): Model {
  const key = JSON.stringify(over);
  let m = cooks.get(key);
  if (m === undefined) {
    m = landed(go(idle(over), { kind: 'begin', units: 'metric', lang: 'en' }, S)[0], S + 1);
    cooks.set(key, m);
  }
  return m;
}

function pull(m: Model): number {
  return m.plan!.deadlines.cookEnd_s;
}

/** The cook at Done: out at the pull, its cooling counted. */
function done(): Model {
  const m = running();
  const out = go(m, { kind: 'tick' }, pull(m) + 25)[0];
  return go(out, { kind: 'tick' }, out.plan!.deadlines.coolEnd_s! + 1)[0];
}

/* ----------------------------------------------------------- the idle page */

test('solve: the idle page asks for its pot\'s surface, and answers the level asked meanwhile', () => {
  const [m, effects] = go(idle(), { kind: 'solve' }, S);
  assert.ok(kinds(effects).includes('askSurface'));
  assert.notEqual(m.solved, null);
  assert.equal(m.unsolved, false);
});

test('controls: idle, the settings follow the controls, saved soon and solved once they settle', () => {
  const m = idle();
  const [next, effects] = go(m, { kind: 'controls', read: { eggCount: 4 }, group: 'eggCount', at_s: 0 }, S);
  assert.equal(next.settings.eggCount, 4);
  assert.equal(next.unsolved, true);
  assert.deepEqual(kinds(effects), ['save', 'solveSoon']);
});

test('units: the system chosen is stored as the cook\'s; Imperial from metric English is the English of 1750 too', () => {
  const m = idle({ unitsChosen: 'metric', language: { chosen: 'en' } });
  const [imperial, effects] = go(m, { kind: 'units', system: 'imperial' }, S);
  assert.equal(imperial.settings.unitsChosen, 'imperial');
  assert.deepEqual(imperial.settings.language, { chosen: 'en-x-1750' });
  assert.ok(kinds(effects).includes('language'), 'the words follow');
  assert.ok(kinds(effects).includes('save'));
  const [back] = go(imperial, { kind: 'units', system: 'metric' }, S);
  assert.equal(back.settings.unitsChosen, 'metric');
  assert.deepEqual(back.settings.language, imperial.settings.language, 'back to metric leaves the language alone');
});

test('language: the words follow, from the language they were in; the units are never touched', () => {
  const m = idle({ unitsChosen: 'metric' });
  const [after, effects] = go(m, { kind: 'language', pick: 'en-x-1750' }, S);
  assert.deepEqual(after.settings.language, { chosen: 'en-x-1750' });
  assert.equal(after.settings.unitsChosen, m.settings.unitsChosen);
  assert.deepEqual(kinds(effects), ['save', 'language']);
});

test('mute: the sound toggles, idle or mid-cook, and is saved', () => {
  const [muted, effects] = go(idle(), { kind: 'mute' }, S);
  assert.equal(muted.settings.muted, true);
  assert.equal(controlsOf(muted).muted, true);
  assert.deepEqual(kinds(effects), ['save']);
  const cook = running();
  const [mid] = go(cook, { kind: 'mute' }, S + 10);
  assert.equal(mid.settings.muted, true);
  assert.equal(mid.cook, cook.cook, 'the cook is untouched');
});

test('alarm: the sound picked is heard, kept with the settings and the controls, mid-cook too', () => {
  const [m, effects] = go(running(), { kind: 'alarm', sound: 'hen' }, S + 10);
  assert.equal(m.settings.alarm, 'hen');
  assert.equal(controlsOf(m).alarm, 'hen');
  assert.deepEqual(kinds(effects), ['previewAlarm', 'save']);
});

test('pans: a boil measured is kept quietly', () => {
  const [m, effects] = go(idle(), { kind: 'pans', boilMemory: { '2.0': 500 } }, S);
  assert.deepEqual(m.boilMemory, { '2.0': 500 });
  assert.deepEqual(effects, []);
});

test('calibration: everything forgotten, the posterior and the pans new, and what has been learned said again', () => {
  const fresh = knowing({ particles: 50, eggsLogged: 0, taste: 0.1 });
  const [m] = go(idle(), { kind: 'calibration', calib: fresh, boilMemory: {} }, S);
  assert.equal(m.calib, fresh);
  assert.deepEqual(m.boilMemory, {});
  assert.deepEqual(m.note, { rev: 1, say: 'learned' }, 'over the questions');
});

test('learned, relabelled: solved again, and what has been learned said again', () => {
  const m = idle();
  for (const kind of ['learned', 'relabelled'] as const) {
    const [next, effects] = go(m, { kind: kind }, S);
    assert.notEqual(next.solved, null, kind);
    assert.ok(kinds(effects).includes('askSurface'), kind);
    assert.deepEqual(next.note, { rev: 1, say: 'learned' }, kind);
  }
});

test('forget, export: carried out by the runner, the model untouched', () => {
  const m = idle();
  assert.deepEqual(go(m, { kind: 'forget' }, S), [m, [{ kind: 'forgetAll' }]]);
  assert.deepEqual(go(m, { kind: 'export' }, S), [m, [{ kind: 'export' }]]);
});

test('sharing: turned on forgets a deletion said; a deletion asked, done and confirmed', () => {
  const said = { ...idle(), deletedHere: true };
  const [on, effects] = go(said, { kind: 'shareOn', on: true }, S);
  assert.equal(on.deletedHere, false);
  assert.deepEqual(effects, [{ kind: 'setSharing', on: true }]);
  assert.deepEqual(go(idle(), { kind: 'shareDelete' }, S)[1], [{ kind: 'deleteShared' }]);
  const [deleted] = go(idle(), { kind: 'shareDeleted', confirmed: true }, S);
  assert.equal(deleted.deletedHere, true);
});

test('nudge: a new draw, and the idle page solved again with it', () => {
  const [m, effects] = go(idle(), { kind: 'nudge', draw: 7 }, S);
  assert.equal(m.nudgeDraw, 7);
  assert.ok(kinds(effects).includes('askSurface'));
});

test('persisted: whether a write of the cook reads back, as the runner found it', () => {
  assert.equal(go(running(), { kind: 'persisted', works: false }, S + 5)[0].works, false);
});

/* -------------------------------------------------------------- the cook */

test('begin: the cook the settings describe starts, and the controls show its own choices, nothing in hand', () => {
  const [m, effects] = go(idle({ startMode: 'hot' }), { kind: 'begin', units: 'metric', lang: 'en' }, S);
  assert.notEqual(m.cook, null);
  assert.equal(m.controlsStart_s, S);
  assert.deepEqual(m.hand, nothingInHand());
  assert.ok(['persist', 'blip', 'handTimer'].every((k) => kinds(effects).includes(k)));
  assert.deepEqual(m.cookControls, settingsOfChoices(m.settings, m.cook!.choices, sizeClasses), 'the controls show the cook\'s own choices');
});

test('start: a cook on these choices, written down, with a blip', () => {
  const m = running();
  const [next, effects] = go(idle(), { kind: 'start', choices: m.cook!.choices, nudge_s: 0, units: 'metric', lang: 'en', leanHint_s: 0 }, S);
  assert.deepEqual(next.cook?.choices, m.cook!.choices);
  assert.ok(kinds(effects).includes('persist') && kinds(effects).includes('blip'));
});

test('cancel: the cook ends, nothing in hand, the controls the settings again', () => {
  const [m, effects] = go(running(), { kind: 'cancel' }, S + 30);
  assert.equal(m.cook, null);
  assert.equal(m.hand, null);
  assert.equal(controlsOf(m), m.settings);
  assert.ok(kinds(effects).includes('handTimer') && kinds(effects).includes('silence'));
});

test('tick: rings once per deadline, the pull and the end of the cooling, ticked a quarter second at a time', () => {
  let m = running();
  const rang: string[] = [];
  const end = pull(m) + 400;
  for (let now = S + 1; now < end; now += 0.25) {
    const [next, effects] = go(m, { kind: 'tick' }, now);
    m = next;
    for (const e of effects) if (e.kind === 'ring') rang.push(e.moment);
    if (m.cook === null) break;
  }
  assert.deepEqual(rang, ['pull', 'cooled']);
});

test('tick: a page woken past both deadlines rings the pull it missed, once, and not Done', () => {
  const m = running();
  const coolEnd = pull(m) + 300;
  const [woken, effects] = go(m, { kind: 'tick' }, coolEnd);
  assert.deepEqual(effects.flatMap((e) => (e.kind === 'ring' ? [e.moment] : [])), ['pull']);
  const [, again] = go(woken, { kind: 'tick' }, coolEnd + 1);
  assert.ok(!kinds(again).includes('ring'), 'and nothing more');
});

test('restore: a deadline that passed before the page was shown rings nothing', () => {
  const m = running();
  const stored = { cook: m.cook!, answers: 'none' as const, leanHint_s: m.leanHint_s };
  const fresh = { ...idle(), surfaces: m.surfaces };
  for (const at of [pull(m) + 5, pull(m) + 300]) {
    const [back, effects] = go(fresh, { kind: 'restore', stored: stored, reloaded: true }, at);
    assert.ok(!kinds(effects).includes('ring'), `nothing rung at ${at - S} s`);
    assert.equal(back.reloaded, true);
    // And ticked on from there, the deadline already passed is not rung.
    const [, ticked] = go(back, { kind: 'tick' }, at + 1);
    assert.ok(!ticked.some((e) => e.kind === 'ring' && e.moment === 'pull'), 'the pull, gone by unheard, stays unheard');
  }
});

test('restore in a tab the app was moved to: the alarm armed for the same pull, and a pull due rung once', () => {
  const m = running();
  const stored = { cook: m.cook!, answers: 'none' as const, leanHint_s: m.leanHint_s };
  const fresh = { ...idle(), surfaces: m.surfaces };
  const [before] = go(fresh, { kind: 'restore', stored: stored, reloaded: false }, pull(m) - 60);
  assert.equal(before.reloaded, false, 'no note of an alarm lost');
  assert.equal(before.pull_s, m.pull_s, 'the pull where it was');
  const [due, effects] = go(fresh, { kind: 'restore', stored: stored, reloaded: false }, pull(m) + 5);
  assert.ok(effects.some((e) => e.kind === 'ring' && e.moment === 'pull'), 'the pull due, rung');
  const [, again] = go(due, { kind: 'tick' }, pull(m) + 6);
  assert.ok(!kinds(again).includes('ring'), 'once');
});

test('landed: a cook waiting on its surface is planned on it', () => {
  const [m] = go(idle({ startMode: 'hot' }), { kind: 'begin', units: 'metric', lang: 'en' }, S);
  assert.notEqual(m.need.surface, null);
  assert.equal(m.plan?.decided, null, 'on the interim time');
  assert.notEqual(landed(m, S + 1).plan?.decided, null);
});

test('before: a calibration before an egg is taken in only for a cook on screen or waiting', () => {
  const m = running();
  const stranger = go(m, { kind: 'before', id_ms: m.cook!.id_ms + 1, calibration: C, surface: null }, S + 5);
  assert.deepEqual(stranger[0].before, [], 'another cook\'s: nothing');
  assert.deepEqual(stranger[1], []);
  const ours = go(m, { kind: 'before', id_ms: m.cook!.id_ms, calibration: C, surface: null }, S + 5)[0];
  // Kept only while the plan as it ran is stale: here it is not, so it goes.
  assert.equal(ours.before.length, 0);
});

test('primary: the boil tapped at Heating, the alarm stopped first', () => {
  const m = running({ startMode: 'cold' });
  const [next, effects] = go(m, { kind: 'primary' }, S + 400);
  assert.equal(next.cook?.events.boilAt_s, S + 400);
  assert.equal(kinds(effects)[0], 'silence');
  assert.ok(kinds(effects).includes('blip'));
});

test('stillOut: asked whether the egg is still in, no: the pull stands', () => {
  let m = running({ startMode: 'hot', cooling: 'ice' });
  m = go(m, { kind: 'tick' }, pull(m) + 25)[0];
  m = go(m, { kind: 'correct', choices: { ...m.cook!.choices, startMode: 'cold' }, startedAt_s: null }, pull(m) + 30)[0];
  assert.equal(m.plan?.deadlines.asking, true, 'the question is open');
  const [after] = go(m, { kind: 'stillOut' }, pull(m) + 35);
  assert.equal(after.plan?.deadlines.asking, false);
  assert.ok(after.cook!.events.pulled !== null);
});

test('correct: a choice changed is the cook\'s, planned again from its start', () => {
  const m = running();
  const [next] = go(m, { kind: 'correct', choices: { ...m.cook!.choices, eggCount: 4 }, startedAt_s: null }, S + 60);
  assert.equal(next.cook?.choices.eggCount, 4);
  assert.equal(next.cook?.startedAt_s, m.cook!.startedAt_s);
});

test('answered: a question answered once stays answered; the row settles on the answer taken', () => {
  const m = done();
  const [first, effects] = go(m, { kind: 'answered', yolkWord: 'jammy', white: null, probe: null }, pull(m) + 600);
  assert.deepEqual(effects.filter((e) => e.kind === 'answerTaken'), [{ kind: 'answerTaken', yolkWord: 'jammy', white: null }]);
  const [again, more] = go(first, { kind: 'answered', yolkWord: 'soft', white: null, probe: null }, pull(m) + 601);
  assert.equal(again.cook, first.cook, 'nothing changed');
  assert.deepEqual(more, []);
});

test('probe: a reading no kitchen could have made is refused, with the range it should be in', () => {
  const m = done();
  const [, effects] = go(m, { kind: 'probe', reading_C: 5 }, pull(m) + 600);
  const refused = effects.find((e) => e.kind === 'probeRefused');
  assert.ok(refused !== undefined && refused.kind === 'probeRefused' && refused.low_C > 5);
  const [, none] = go(m, { kind: 'probe', reading_C: null }, pull(m) + 600);
  assert.ok(kinds(none).includes('probeRefused'), 'not a number: refused too');
});

test('kept: the egg kept is thanked for at Done; one that could not be kept puts its questions away', () => {
  const answered = go(done(), { kind: 'answered', yolkWord: 'jammy', white: null, probe: null }, pull(done()) + 600)[0];
  const id = answered.cook!.id_ms;
  assert.equal(answered.note.say, 'learning', 'an answer taken: learning');
  assert.equal(go(answered, { kind: 'kept', id_ms: id, kept: true }, pull(done()) + 601)[0].note.say, 'thanks');
  assert.equal(go(answered, { kind: 'kept', id_ms: id, kept: false }, pull(done()) + 601)[0].questions, 'away');
});

/* ------------------------------------------------- a correction in hand */

/** A change to the controls mid-cook, of `group`, at `at_s` on the
 *  gestures' clock. */
function change(m: Model, over: Partial<Settings>, group: HandGroup | null, at_s: number, now_s = S + 60): [Model, Effect[]] {
  return go(m, { kind: 'controls', read: { ...over }, group: group, at_s: at_s }, now_s);
}

/** What the correction in hand did: a gesture or a timer. */
function hand(m: Model, event: HandEvent, now_s = S + 60): [Model, Effect[]] {
  return go(m, { kind: 'hand', event: event }, now_s);
}

function timers(effects: Effect[]): string[] {
  return effects.flatMap((e) => (e.kind === 'handTimer' ? [`${e.timer}:${e.at_s}`] : []));
}

test('controls mid-cook: the change is in hand, not the cook\'s; a preview of it never commits', () => {
  const m = running();
  const [held, effects] = change(m, { eggCount: 4 }, 'eggCount', 1);
  assert.equal(held.cook, m.cook, 'not committed');
  assert.equal(controlsOf(held).eggCount, 4);
  assert.equal(held.settings.eggCount, m.settings.eggCount, 'nor written to the settings');
  assert.equal(held.hand?.hand, 'eggCount');
  assert.deepEqual(timers(effects), ['hold:null', 'preview:1.09', 'settle:2.5']);
  const [aimed, none] = hand(held, { kind: 'timer', at_s: 1.09, timer: 'preview' });
  assert.equal(aimed.cook, m.cook, 'a preview stores nothing');
  assert.notEqual(aimed.aim?.section ?? null, null, 'the egg it aims for');
  assert.deepEqual(none, [], 'and rings and writes nothing');
});

test('a settle commits the change in hand: the cook corrected, and the group\'s settings written for the next cook', () => {
  const [held] = change(running(), { eggCount: 4 }, 'eggCount', 1);
  const [committed, effects] = hand(held, { kind: 'timer', at_s: 2.5, timer: 'settle' }, S + 62);
  assert.equal(committed.cook?.choices.eggCount, 4);
  assert.equal(committed.settings.eggCount, 4, 'for the next cook too');
  assert.ok(kinds(effects).includes('persist') && kinds(effects).includes('save'));
  assert.equal(committed.hand?.hand, null);
  assert.ok(timers(effects).includes('hold:2.5'), 'the aimed-for egg goes a settle after the change');
  const [gone] = hand(committed, { kind: 'timer', at_s: 2.5, timer: 'hold' }, S + 62);
  assert.equal(gone.aim, null);
});

test('controls mid-cook: another group\'s change by keyboard commits the one in hand alone, as it was', () => {
  const m = running();
  const [first] = change(m, { eggCount: 4 }, 'eggCount', 0);
  const [second] = change(first, { waterLitres: 3 }, 'waterLitres', 0.1);
  assert.equal(second.cook?.choices.eggCount, 4, 'the first committed');
  assert.equal(second.cook?.choices.waterLitres, m.cook!.choices.waterLitres, 'without the second');
  assert.equal(second.settings.waterLitres, m.settings.waterLitres);
  assert.equal(second.hand?.hand, 'waterLitres', 'which is in hand in its turn');
});

test('a size, then a weight: one group, one commit, the egg weighed', () => {
  const m = running();
  const [size] = change(m, { sizeIndex: 3 }, 'mass', 0);
  const [weighed] = change(size, { sizeIndex: -1, customMinor_mm: 44, measuredBy: 'scale' }, 'mass', 0.5);
  assert.equal(weighed.cook, m.cook, 'nothing committed between');
  const [committed] = hand(weighed, { kind: 'timer', at_s: 2, timer: 'settle' }, S + 62);
  assert.equal(committed.cook?.choices.massFrom, 'scale');
  assert.equal(committed.settings.sizeIndex, -1);
  assert.equal(committed.settings.customMinor_mm, 44);
});

test('startStep: after another group\'s change by keyboard, that one is committed alone, and the start settles in its turn', () => {
  const m = running();
  const [first] = change(m, { eggCount: 4 }, 'eggCount', 0, S + 30);
  const [second] = go(first, { kind: 'startStep', up: false, at_s: 0.1 }, S + 30);
  assert.equal(second.cook?.choices.eggCount, 4, 'the first committed');
  assert.equal(second.cook?.startedAt_s, S, 'without the start');
  assert.equal(second.controlsStart_s, S - 60, 'which is in hand in its turn');
  assert.equal(second.hand?.hand, 'startedAt');
  const [settled] = hand(second, { kind: 'timer', at_s: 1.6, timer: 'settle' }, S + 32);
  assert.equal(settled.cook?.startedAt_s, S - 60);
  assert.equal(settled.cook?.choices.eggCount, 4);
});

test('leave: the page going commits a change still settling, and lets go of a finger down', () => {
  const [down] = hand(running(), { kind: 'down', at_s: 0, group: 'eggCount' });
  const [held] = change(down, { eggCount: 4 }, 'eggCount', 0.05);
  const [gone] = hand(held, { kind: 'leave', at_s: 1 }, S + 61);
  assert.equal(gone.cook?.choices.eggCount, 4);
  assert.equal(gone.hand?.down, null, 'no finger is down on a page that went');
});

test('a setting of no group mid-cook: another control, the change in hand committed, and the setting written at once', () => {
  const m = running();
  const [held] = change(m, { eggCount: 4 }, 'eggCount', 0);
  const [after, effects] = change(held, { probe: true, eggCount: 4 }, null, 0.4);
  assert.equal(after.cook?.choices.eggCount, 4, 'the change in hand committed');
  assert.equal(after.settings.probe, true, 'the thermometer written');
  assert.ok(kinds(effects).includes('save'));
});

test('primary: a change still settling is committed before the button acts', () => {
  const [held] = change(running({ startMode: 'cold' }), { eggCount: 4 }, 'eggCount', 0, S + 60);
  const [after] = go(held, { kind: 'primary' }, S + 400);
  assert.equal(after.cook?.choices.eggCount, 4);
  assert.equal(after.cook?.events.boilAt_s, S + 400);
});

test('cancel: a change still settling is committed first, by keyboard too, so the egg Cancel ends has it', () => {
  const m = done();
  const at = m.plan!.deadlines.coolEnd_s! + 5;
  const [held] = change(m, { eggCount: 4 }, 'eggCount', 0, at);
  const [after, effects] = go(held, { kind: 'cancel' }, at + 1);
  assert.equal(after.cook, null);
  assert.equal(after.settings.eggCount, 4, 'written for the next cook');
  const ended = effects.flatMap((e) => (e.kind === 'persistEnded' ? [e.cook] : []));
  assert.equal(ended.length, 1, 'the egg ended, waiting on its record');
  assert.equal(ended[0]!.choices.eggCount, 4, 'with the correction');
});

test('stillOut: a change still settling is committed before the pull stands', () => {
  let m = running({ startMode: 'hot', cooling: 'ice' });
  m = go(m, { kind: 'tick' }, pull(m) + 25)[0];
  m = go(m, { kind: 'correct', choices: { ...m.cook!.choices, startMode: 'cold' }, startedAt_s: null }, pull(m) + 30)[0];
  assert.equal(m.plan?.deadlines.asking, true, 'the question is open');
  const [held] = change(m, { eggCount: 4 }, 'eggCount', 0, pull(m) + 32);
  const [after, effects] = go(held, { kind: 'stillOut' }, pull(m) + 35);
  assert.equal(after.cook?.choices.eggCount, 4, 'the correction is the cook\'s');
  assert.equal(after.hand?.hand, null, 'and nothing is left in hand to commit after');
  assert.equal(after.plan?.deadlines.asking, false, 'the pull stands');
  assert.equal(timers(effects)[0], 'settle:null');
});

test('probe: a change still settling is committed before the reading is scored, by keyboard too', () => {
  const m = done();
  const at = m.plan!.deadlines.coolEnd_s! + 5;
  const [held] = change(m, { eggCount: 4 }, 'eggCount', 0, at);
  assert.equal(held.cook?.choices.eggCount, m.cook?.choices.eggCount, 'in hand, not yet the cook\'s');
  const reading = { kind: 'probe', reading_C: m.plan!.solution.result.peakYolk_C } as const;
  const [after, effects] = go(held, reading, at + 1);
  assert.equal(after.cook?.choices.eggCount, 4, 'the correction is the cook\'s');
  assert.equal(after.hand?.hand, null, 'and nothing is left in hand to commit after');
  assert.ok(!kinds(effects).includes('probeTaken'), 'not scored on the cook as it was');
  assert.equal(after.probeHeld, true, 'held for the corrected egg\'s record, read again when its surface lands');
});

test('after the pull a new level only previews, nothing written, and the slider goes back when the aimed-for egg goes', () => {
  let m = running();
  m = go(m, { kind: 'tick' }, pull(m) + 25)[0];
  const level = m.cook!.choices.level;
  const [held] = change(m, { doneness: 0.9 }, 'level', 0, pull(m) + 30);
  const [committed] = hand(held, { kind: 'timer', at_s: 1.5, timer: 'settle' }, pull(m) + 32);
  assert.equal(committed.cook, m.cook, 'the egg came out at the level it was cooked for');
  assert.equal(committed.settings.doneness, m.settings.doneness, 'nothing written for the next cook');
  const [back] = hand(committed, { kind: 'timer', at_s: 1.5, timer: 'hold' }, pull(m) + 34);
  assert.equal(controlsOf(back).doneness, level);
});

test('after the pull another group is corrected, and the level the controls show stays the cook\'s', () => {
  let m = running();
  m = go(m, { kind: 'tick' }, pull(m) + 25)[0];
  const level = m.cook!.choices.level;
  const [slid] = change(m, { doneness: 0.9 }, 'level', 0, pull(m) + 30);
  const [counted] = change(slid, { eggCount: 4 }, 'eggCount', 0.5, pull(m) + 31);
  const [committed] = hand(counted, { kind: 'timer', at_s: 2, timer: 'settle' }, pull(m) + 33);
  assert.equal(committed.cook?.choices.eggCount, 4);
  assert.equal(committed.cook?.choices.level, level);
});

test('startStep: the start a minute earlier or later, as far as the cook allows, and why it went no further', () => {
  const m = running();
  const [later, effects] = go(m, { kind: 'startStep', up: true, at_s: 0 }, S + 10);
  assert.equal(later.controlsStart_s, S + 10, 'no later than now');
  assert.deepEqual(effects[0], { kind: 'startLimit', limit: { kind: 'now', at_s: S + 10 } });
  assert.equal(later.hand?.hand, 'startedAt', 'a correction in hand');
  const [same, more] = go(later, { kind: 'startStep', up: true, at_s: 0.1 }, S + 10);
  assert.equal(same.controlsStart_s, later.controlsStart_s, 'at the limit, nothing moves');
  assert.equal(same.hand, later.hand);
  assert.equal(more.length, 1);
  const [earlier, none] = go(m, { kind: 'startStep', up: false, at_s: 0 }, S + 10);
  assert.equal(earlier.controlsStart_s, S - 60);
  assert.deepEqual(none[0], { kind: 'startLimit', limit: null });
});
