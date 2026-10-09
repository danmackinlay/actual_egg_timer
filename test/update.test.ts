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

import { CookSurface } from '../src/core/running.js';
import { Effect, Model, Msg, Part, update } from '../src/ui/model.js';
import { emptyModel } from '../src/ui/state.js';
import { DEFAULT_SETTINGS, Settings } from '../src/ui/store.js';
import { gridFor, knowing } from '../tools/common.js';

const S = 1791363600;
const C = knowing({ particles: 200, eggsLogged: 4, taste: 0.1 });

/** An idle page on the settings `over`, nothing solved yet. */
function idle(over: Partial<Settings> = {}): Model {
  const settings = { ...DEFAULT_SETTINGS, ...over };
  return {
    ...emptyModel(), settings: settings, controls: { ...settings }, boilMemory: { '2.0': 480 }, calib: C,
    appVersion: '0.5.0-alpha.1', prior: 'test',
  };
}

function go(m: Model, msg: Msg, now_s: number): [Model, Effect[]] {
  return update(m, msg, now_s * 1000);
}

function kinds(effects: Effect[]): string[] {
  return effects.map((e) => e.kind);
}

/** The parts of the page asked to be drawn again from `a` to `b`. */
function redrawn(a: Model, b: Model): Part[] {
  return (Object.keys(a.redraws) as Part[]).filter((p) => a.redraws[p] !== b.redraws[p]);
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
  assert.notEqual(m.idleAnswer, null);
  assert.equal(m.unsolved, false);
});

test('controls: idle, the settings follow the controls, saved soon and solved once they settle', () => {
  const m = idle();
  const [next, effects] = go(m, { kind: 'controls', controls: { ...m.controls, eggCount: 4 }, source: 'eggCount', group: 1, real_ms: 0 }, S);
  assert.equal(next.settings.eggCount, 4);
  assert.notEqual(next.settings, next.controls, 'a copy');
  assert.equal(next.unsolved, true);
  assert.deepEqual(kinds(effects), ['save', 'solveSoon']);
  assert.deepEqual(redrawn(m, next), ['echo'], 'what follows it drawn, but the field it came from');
  assert.equal(next.echoSource, 'eggCount');
});

test('units: the system chosen is stored as the cook\'s; Imperial from metric English is the English of 1750 too', () => {
  const m = idle({ unitsChosen: 'metric', language: { chosen: 'en' } });
  const [imperial, effects] = go(m, { kind: 'units', system: 'imperial' }, S);
  assert.equal(imperial.settings.unitsChosen, 'imperial');
  assert.deepEqual(imperial.settings.language, { chosen: 'en-x-1750' });
  assert.ok(kinds(effects).includes('language'), 'the words follow');
  assert.deepEqual(redrawn(m, imperial), ['units']);
  assert.ok(kinds(effects).includes('save'));
  const [back] = go(imperial, { kind: 'units', system: 'metric' }, S);
  assert.equal(back.settings.unitsChosen, 'metric');
  assert.deepEqual(back.settings.language, imperial.settings.language, 'back to metric leaves the language alone');
});

test('language: the words follow, from the language they were in; the units are never touched', () => {
  const m = idle({ unitsChosen: 'metric' });
  const next: Settings['language'] = { chosen: 'en-x-1750' };
  const [after, effects] = go(m, { kind: 'language', next: next }, S);
  assert.deepEqual(after.settings.language, next);
  assert.equal(after.settings.unitsChosen, m.settings.unitsChosen);
  assert.deepEqual(kinds(effects), ['save', 'language']);
});

test('mute: the sound toggles, idle or mid-cook, and is saved', () => {
  const [muted, effects] = go(idle(), { kind: 'mute' }, S);
  assert.equal(muted.settings.muted, true);
  assert.equal(muted.controls.muted, true);
  assert.deepEqual(kinds(effects), ['save']);
  const cook = running();
  const [mid] = go(cook, { kind: 'mute' }, S + 10);
  assert.equal(mid.settings.muted, true);
  assert.equal(mid.cook, cook.cook, 'the cook is untouched');
});

test('alarm: the sound picked is heard, kept with the settings and the controls, mid-cook too', () => {
  const [m, effects] = go(running(), { kind: 'alarm', sound: 'hen' }, S + 10);
  assert.equal(m.settings.alarm, 'hen');
  assert.equal(m.controls.alarm, 'hen');
  assert.deepEqual(kinds(effects), ['previewAlarm', 'save']);
});

test('settingsTaken: another tab\'s settings; an idle page\'s controls follow, a running cook keeps its own choices', () => {
  const theirs = { ...DEFAULT_SETTINGS, eggCount: 5, muted: true };
  const [m, effects] = go(idle(), { kind: 'settingsTaken', settings: theirs }, S);
  assert.equal(m.controls.eggCount, 5);
  assert.deepEqual(redrawn(idle(), m), ['controls']);
  assert.ok(kinds(effects).includes('language'));
  const cook = running();
  const [mid, more] = go(cook, { kind: 'settingsTaken', settings: theirs }, S + 10);
  assert.equal(mid.settings.eggCount, 5);
  assert.equal(mid.controls.eggCount, cook.controls.eggCount, 'the cook\'s own');
  assert.equal(mid.controls.muted, true, 'but the sound is the kitchen\'s');
  assert.deepEqual(redrawn(cook, mid), ['alarm']);
  assert.ok(kinds(more).includes('language'));
});

test('pans: a boil this page measured is kept quietly; another tab\'s is said and solved for', () => {
  const [quiet, none] = go(idle(), { kind: 'pans', boilMemory: { '2.0': 500 }, quiet: true }, S);
  assert.deepEqual(quiet.boilMemory, { '2.0': 500 });
  assert.deepEqual(none, []);
  const [loud, said] = go(idle(), { kind: 'pans', boilMemory: { '2.0': 500 }, quiet: false }, S);
  assert.deepEqual(redrawn(idle(), quiet), []);
  assert.deepEqual(redrawn(idle(), loud), ['learned']);
  assert.ok(kinds(said).includes('askSurface'), 'solved again');
});

test('calibration: everything forgotten, the posterior and the pans new, and what is said of them drawn again', () => {
  const fresh = knowing({ particles: 50, eggsLogged: 0, taste: 0.1 });
  const [m] = go(idle(), { kind: 'calibration', calib: fresh, boilMemory: {} }, S);
  assert.equal(m.calib, fresh);
  assert.deepEqual(m.boilMemory, {});
  assert.deepEqual(redrawn(idle(), m), ['learned']);
  assert.deepEqual(m.note, { rev: 1, say: 'learned' }, 'and over the questions');
});

test('learned, relabelled, stores: solved again, and what each changed drawn', () => {
  const m = idle();
  assert.deepEqual(redrawn(m, go(m, { kind: 'learned' }, S)[0]), ['learned']);
  assert.deepEqual(redrawn(m, go(m, { kind: 'relabelled' }, S)[0]), ['units', 'learned', 'words']);
  assert.deepEqual(redrawn(m, go(m, { kind: 'stores' }, S)[0]), ['learned', 'share']);
});

test('forget, export: carried out by the runner, the model untouched', () => {
  const m = idle();
  assert.deepEqual(go(m, { kind: 'forget' }, S), [m, [{ kind: 'forgetAll' }]]);
  assert.deepEqual(go(m, { kind: 'export' }, S), [m, [{ kind: 'export' }]]);
});

test('sharing: turned on forgets a deletion said; a deletion asked, done and confirmed; a change drawn', () => {
  const said = { ...idle(), deletedHere: true };
  const [on, effects] = go(said, { kind: 'shareOn', on: true }, S);
  assert.equal(on.deletedHere, false);
  assert.deepEqual(effects, [{ kind: 'setSharing', on: true }]);
  assert.deepEqual(go(idle(), { kind: 'shareDelete' }, S)[1], [{ kind: 'deleteShared' }]);
  const [deleted] = go(idle(), { kind: 'shareDeleted', confirmed: true }, S);
  assert.equal(deleted.deletedHere, true);
  assert.deepEqual(redrawn(idle(), deleted), ['share']);
  assert.deepEqual(redrawn(idle(), go(idle(), { kind: 'shared' }, S)[0]), ['share']);
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
  assert.notEqual(m.edit, null);
  assert.equal(m.edit?.pending, false);
  assert.ok(['persist', 'blip', 'editTimersOff'].every((k) => kinds(effects).includes(k)));
  assert.deepEqual(redrawn(idle({ startMode: 'hot' }), m), ['controls'], 'the controls drawn from the cook');
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
  assert.equal(m.edit, null);
  assert.deepEqual(m.controls, m.settings);
  assert.ok(kinds(effects).includes('editTimersOff') && kinds(effects).includes('silence'));
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
    const [back, effects] = go(fresh, { kind: 'restore', stored: stored }, at);
    assert.ok(!kinds(effects).includes('ring'), `nothing rung at ${at - S} s`);
    assert.equal(back.reloaded, true);
    // And ticked on from there, the deadline already passed is not rung.
    const [, ticked] = go(back, { kind: 'tick' }, at + 1);
    assert.ok(!ticked.some((e) => e.kind === 'ring' && e.moment === 'pull'), 'the pull, gone by unheard, stays unheard');
  }
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
  const m = { ...done(), storedId_ms: done().cook!.id_ms };
  const [first, effects] = go(m, { kind: 'answered', yolkWord: 'jammy', white: null, probe: null }, pull(m) + 600);
  assert.deepEqual(effects.filter((e) => e.kind === 'answerTaken'), [{ kind: 'answerTaken', yolkWord: 'jammy', white: null }]);
  const [again, more] = go(first, { kind: 'answered', yolkWord: 'soft', white: null, probe: null }, pull(m) + 601);
  assert.equal(again.cook, first.cook, 'nothing changed');
  assert.deepEqual(more, []);
});

test('probe: a reading no kitchen could have made is refused, with the range it should be in', () => {
  const m = { ...done(), storedId_ms: done().cook!.id_ms };
  const [, effects] = go(m, { kind: 'probe', reading_C: 5 }, pull(m) + 600);
  const refused = effects.find((e) => e.kind === 'probeRefused');
  assert.ok(refused !== undefined && refused.kind === 'probeRefused' && refused.low_C > 5);
  const [, none] = go(m, { kind: 'probe', reading_C: null }, pull(m) + 600);
  assert.ok(kinds(none).includes('probeRefused'), 'not a number: refused too');
});

test('kept: the egg kept is thanked for at Done; one that could not be kept puts its questions away', () => {
  const answered = go({ ...done(), storedId_ms: done().cook!.id_ms }, { kind: 'answered', yolkWord: 'jammy', white: null, probe: null }, pull(done()) + 600)[0];
  const id = answered.cook!.id_ms;
  assert.equal(answered.note.say, 'learning', 'an answer taken: learning');
  assert.equal(go(answered, { kind: 'kept', id_ms: id, kept: true }, pull(done()) + 601)[0].note.say, 'thanks');
  assert.equal(go(answered, { kind: 'kept', id_ms: id, kept: false }, pull(done()) + 601)[0].questions, 'away');
});

/* ------------------------------------------------- a correction in hand */

/** A change to the controls mid-cook, on control `group`, at `real_ms`. */
function change(m: Model, over: Partial<Settings>, group: number, real_ms: number, now_s = S + 60): [Model, Effect[]] {
  return go(m, { kind: 'controls', controls: { ...m.controls, ...over }, source: null, group: group, real_ms: real_ms }, now_s);
}

function timers(effects: Effect[]): string[] {
  return effects.flatMap((e) => (e.kind === 'editTimer' ? [`${e.timer}:${e.at_ms}`] : []));
}

test('controls mid-cook: the change is in hand, not the cook\'s; a preview of it never commits', () => {
  const m = running();
  const [held, effects] = change(m, { eggCount: 4 }, 3, 1000);
  assert.equal(held.cook, m.cook, 'not committed');
  assert.equal(held.controls.eggCount, 4);
  assert.equal(held.settings.eggCount, m.settings.eggCount, 'nor written to the settings');
  assert.equal(held.edit?.pending, true);
  assert.deepEqual(timers(effects), ['release:null', 'preview:1090', 'settle:2500']);
  const [aimed, none] = go(held, { kind: 'editTimer', timer: 'preview' }, S + 60);
  assert.equal(aimed.cook, m.cook, 'a preview stores nothing');
  assert.notEqual(aimed.aim?.section ?? null, null, 'the egg it aims for');
  assert.deepEqual(none, [], 'and rings and writes nothing');
});

test('editTimer: a settle commits the change in hand once', () => {
  const [held] = change(running(), { eggCount: 4 }, 3, 1000);
  const [committed, effects] = go(held, { kind: 'editTimer', timer: 'settle' }, S + 62);
  assert.equal(committed.cook?.choices.eggCount, 4);
  assert.equal(committed.settings.eggCount, 4, 'for the next cook too');
  assert.ok(kinds(effects).includes('persist') && kinds(effects).includes('save'));
  assert.equal(committed.edit?.pending, false);
  assert.ok(timers(effects).includes('release:2500'), 'the aimed-for egg goes a settle after the change');
  const [again, more] = go(committed, { kind: 'editTimer', timer: 'settle' }, S + 63);
  assert.equal(again.cook, committed.cook, 'nothing more to commit');
  assert.deepEqual(more, []);
});

test('editTimer: the aimed-for egg goes, unless a finger is down', () => {
  const [held] = change(running(), { eggCount: 4 }, 3, 1000);
  const [committed] = go(held, { kind: 'editTimer', timer: 'settle' }, S + 62);
  assert.notEqual(committed.aim, null);
  assert.equal(go(committed, { kind: 'editTimer', timer: 'release' }, S + 63)[0].aim, null);
  const [down] = go(committed, { kind: 'fingerDown', group: 3, slider: false, real_ms: 3000 }, S + 63);
  assert.notEqual(go(down, { kind: 'editTimer', timer: 'release' }, S + 63)[0].aim, null, 'a finger down keeps it');
});

test('fingerUp: the slider let go commits at once; a tap settles first; a hold commits on the lift', () => {
  const m = running();
  const [down] = go(m, { kind: 'fingerDown', group: 5, slider: true, real_ms: 0 }, S + 60);
  const [dragged, drag] = change(down, { doneness: 0.7 }, 5, 50);
  assert.ok(!timers(drag).some((t) => t.startsWith('settle')), 'no settle while the finger is down');
  const [released] = go(dragged, { kind: 'fingerUp', real_ms: 100 }, S + 60);
  assert.equal(released.cook?.choices.level, 0.7);

  const [tap] = go(m, { kind: 'fingerDown', group: 3, slider: false, real_ms: 0 }, S + 60);
  const [changed] = change(tap, { eggCount: 4 }, 3, 50);
  const [up, effects] = go(changed, { kind: 'fingerUp', real_ms: 100 }, S + 60);
  assert.equal(up.cook, m.cook, 'a tap is not committed on the lift');
  assert.deepEqual(timers(effects), ['settle:1600']);
  const [held] = go(changed, { kind: 'fingerUp', real_ms: 500 }, S + 60);
  assert.equal(held.cook?.choices.eggCount, 4, 'a − or + held long enough to repeat commits on the lift');
});

test('fingerDown: on another control, the change in hand is committed first', () => {
  const [held] = change(running(), { eggCount: 4 }, 3, 0);
  const [down] = go(held, { kind: 'fingerDown', group: 7, slider: false, real_ms: 100 }, S + 61);
  assert.equal(down.cook?.choices.eggCount, 4);
  assert.equal(down.edit?.down?.group, 7);
});

test('controls mid-cook: another control\'s change by keyboard commits the one in hand alone, as it was', () => {
  const m = running();
  const [first] = change(m, { eggCount: 4 }, 3, 0);
  const [second] = change(first, { waterLitres: 3 }, 8, 100);
  assert.equal(second.cook?.choices.eggCount, 4, 'the first committed');
  assert.equal(second.cook?.choices.waterLitres, m.cook!.choices.waterLitres, 'without the second');
  assert.equal(second.edit?.pending, true, 'which is in hand in its turn');
  assert.equal(second.edit?.group, 8);
});

test('commit: the page going commits a change still settling', () => {
  const [held] = change(running(), { eggCount: 4 }, 3, 0);
  assert.equal(go(held, { kind: 'commit' }, S + 61)[0].cook?.choices.eggCount, 4);
});

test('primary: a change still settling is committed before the button acts', () => {
  const [held] = change(running({ startMode: 'cold' }), { eggCount: 4 }, 3, 0, S + 60);
  const [after] = go(held, { kind: 'primary' }, S + 400);
  assert.equal(after.cook?.choices.eggCount, 4);
  assert.equal(after.cook?.events.boilAt_s, S + 400);
});

test('after the pull a new level only previews, and the slider goes back when the aimed-for egg goes', () => {
  let m = running();
  m = go(m, { kind: 'tick' }, pull(m) + 25)[0];
  const level = m.cook!.choices.level;
  const [held] = change(m, { doneness: 0.9 }, 5, 0, pull(m) + 30);
  const [committed] = go(held, { kind: 'editTimer', timer: 'settle' }, pull(m) + 32);
  assert.equal(committed.cook?.choices.level, level, 'the egg came out at the level it was cooked for');
  assert.equal(committed.settings.doneness, m.settings.doneness, 'nothing written for the next cook');
  const [back] = go(committed, { kind: 'editTimer', timer: 'release' }, pull(m) + 34);
  assert.equal(back.controls.doneness, level);
  assert.deepEqual(redrawn(committed, back), ['doneness']);
});

test('startStep: the start a minute earlier or later, as far as the cook allows, and why it went no further', () => {
  const m = running();
  const [later, effects] = go(m, { kind: 'startStep', up: true, group: 2, real_ms: 0 }, S + 10);
  assert.equal(later.controlsStart_s, S + 10, 'no later than now');
  assert.deepEqual(effects[0], { kind: 'startLimit', limit: { kind: 'now', at_s: S + 10 } });
  assert.equal(later.edit?.pending, true, 'a correction in hand');
  const [same, more] = go(later, { kind: 'startStep', up: true, group: 2, real_ms: 100 }, S + 10);
  assert.equal(same.controlsStart_s, later.controlsStart_s, 'at the limit, nothing moves');
  assert.equal(same.edit, later.edit);
  assert.equal(more.length, 1);
  const [earlier, none] = go(m, { kind: 'startStep', up: false, group: 2, real_ms: 0 }, S + 10);
  assert.equal(earlier.controlsStart_s, S - 60);
  assert.deepEqual(none[0], { kind: 'startLimit', limit: null });
});
