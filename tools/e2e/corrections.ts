/**
 * Corrections: the pot, the egg, the start and the cooling changed mid-cook
 * and at Done, how each is committed, and what rings. Run by tools/e2e.ts.
 */

import { sleep } from '../chrome.ts';
import { type Rec, type Scenario, type Snap, check } from '../harness.ts';
import {
  COOK_KEY, SETTINGS_KEY, STOPPED, boil, clockAt, cookIn, corrected, deadlines, drag, later, near, panelStart, pick,
  press, rings, start, storedCook,
} from './helpers.ts';

export const correctionScenarios: Record<string, Scenario> = {
  'owner-case': {
    what: 'boiling corrected to cold after Start, as the owner needed: back to Heating, the pull later, the settings follow',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      const pull0 = deadlines(await tab.snap()).cookEnd_s;
      await tab.shift(60);
      await tab.click('#sentence .clause[aria-controls="panelStart"]');
      await tab.click('#startCold');
      s = await corrected(tab, null);
      check(s.phase === 'HEATING', `back to ${s.phase}`);
      check(s.primary === (await tab.words('action.fullBoil')),
        `the button: ${s.primary}`);
      const pull1 = deadlines(s).cookEnd_s;
      check(pull1 > pull0 + 60, `the pull later: ${(pull1 - pull0).toFixed(0)} s`);
      check(storedCook(s)?.choices.startMode === 'cold', 'the stored cook says cold');
      const settings = JSON.parse((await tab.storage(SETTINGS_KEY)) ?? '{}') as { startMode?: string };
      check(settings.startMode === 'cold', `the next cook's setting: ${settings.startMode}`);
      // Picked back up after a reload, as corrected.
      await tab.reload();
      s = await tab.phase('HEATING');
      check(near(deadlines(s).cookEnd_s, pull1, 1e-6), `reloaded: ${(deadlines(s).cookEnd_s - pull1).toFixed(3)} s`);
      return `Heating again; the pull ${(pull1 - pull0).toFixed(0)} s later; settings say cold; the same after a reload`;
    },
  },

  'cold-to-hot-after-tap': {
    what: 'cold corrected to boiling after the boil was pressed: the tap kept, unread, the pot a boiling start',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      await start(tab, 'cold');
      await tab.shift(300);
      let s = await boil(tab);
      const pull0 = deadlines(s).cookEnd_s;
      const tap = storedCook(s)?.events.boilAt_s;
      await tab.shift(60);
      await tab.click('#startHot');
      s = await corrected(tab, null);
      const c = storedCook(s);
      check(c?.events.boilAt_s === tap, `the tap kept: ${c?.events.boilAt_s} (was ${tap})`);
      check(c?.choices.startMode === 'hot', 'the stored cook says boiling');
      const pull1 = deadlines(s).cookEnd_s;
      check(pull1 < pull0, `a boiling start pulls sooner: ${(pull1 - pull0).toFixed(0)} s`);
      check(s.phase === 'COOKING' || s.phase === 'PULL', `in the water: ${s.phase}`);
      return `the tap kept; the pull ${(pull1 - pull0).toFixed(0)} s, ${s.phase}`;
    },
  },

  'heavier-lighter': {
    what: 'a heavier egg mid-cook pulls later, a lighter one sooner; each a correction, committed after the settle',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      const pull0 = deadlines(await tab.snap()).cookEnd_s;
      await tab.shift(30);
      // Nothing yet: a tap settles first. Read in the same task as the tap,
      // so no timer can run between them, however slow the page.
      const atTap = await tab.eval<number | null>(`(() => {
        const e = document.querySelector('#size'); e.value = '3'; e.dispatchEvent(new Event('change', { bubbles: true }));
        return __snap().cook.correctedAt_s; })()`);
      check(atTap === null, 'committed before the settle');
      s = await corrected(tab, null);
      const heavier = deadlines(s).cookEnd_s;
      check(heavier > pull0, `heavier, later: ${(heavier - pull0).toFixed(1)} s`);
      await later(tab);
      await pick(tab, '#size', '1');
      s = await corrected(tab, s);
      const lighter = deadlines(s).cookEnd_s;
      check(lighter < pull0, `lighter, sooner: ${(lighter - pull0).toFixed(1)} s`);
      await later(tab);
      await pick(tab, '#size', '2');
      s = await corrected(tab, s);
      await tab.until('__snap().decided', 'planned on its pot');
      s = await tab.snap();
      check(near(deadlines(s).cookEnd_s, pull0, 1e-6), `back gives back: ${(deadlines(s).cookEnd_s - pull0).toFixed(6)} s`);
      return `heavier +${(heavier - pull0).toFixed(1)} s, lighter ${(lighter - pull0).toFixed(1)} s, back to the pull exactly`;
    },
  },

  'overdue-and-back': {
    what: 'a correction that makes the egg overdue rings at once; changed back within the grace, the pull is cancelled',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      const pull0 = deadlines(await tab.snap()).cookEnd_s;
      await tab.shiftTo(pull0 - 40);
      let base = (await tab.osc()).length;
      await pick(tab, '#size', '0');
      let s = await corrected(tab, null);
      s = await tab.phase('PULL');
      await tab.settle();
      let osc = rings((await tab.osc()).slice(base));
      check(osc.length === 1 && (osc[0].at ?? 0) - osc[0].made < 0.1, `rang at once: ${osc.length}`);
      await tab.shift(5);
      await pick(tab, '#size', '2');
      s = await corrected(tab, s);
      s = await tab.phase('COOKING');
      const ev = storedCook(s)?.events;
      check(ev?.pulled === null && ev?.rangAt_s === null, `nothing observed: ${JSON.stringify(ev)}`);
      check(near(deadlines(s).cookEnd_s, pull0, 1), `the pull back where it was: ${(deadlines(s).cookEnd_s - pull0).toFixed(1)} s`);
      base = (await tab.osc()).length;
      await tab.shiftTo(deadlines(s).cookEnd_s + 1);
      await tab.phase('PULL');
      await tab.settle();
      osc = rings((await tab.osc()).slice(base));
      check(osc.length === 1, `the pull rings again at its time: ${osc.length}`);
      return 'overdue: Pull and a ring at once; back within the grace: Cooking, nothing written; the pull rang again';
    },
  },

  'drag-no-ring': {
    what: 'a drag through an overdue level rings nothing before release; the egg shows the aim while held',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      const level = s.cook?.choices.level ?? 0.41;
      const pull0 = deadlines(s).cookEnd_s;
      await tab.shiftTo(pull0 - 60);
      const base = (await tab.osc()).length;
      await drag(tab, [0.3, 0.1, 0]);
      await tab.until("document.getElementById('eggSection').dataset.egg === 'aim'", 'the aim while held');
      // Held two seconds (a person's span, past every settle), and whatever
      // the page had pending done.
      await sleep(2000);
      await tab.settle();
      s = await tab.snap();
      check(s.phase === 'COOKING' && s.cook?.correctedAt_s === null, `held: ${s.phase}, corrected ${s.cook?.correctedAt_s}`);
      check((await tab.osc()).length === base, 'nothing rang while held');
      await drag(tab, [0.2, level], true, false);
      await tab.settle();
      s = await tab.snap();
      check(s.phase === 'COOKING' && s.cook?.correctedAt_s === null, `released at the level it had: ${s.phase}`);
      check((await tab.osc()).length === base, 'nothing rang on release');
      const egg = await tab.eval<string>("document.getElementById('eggSection').dataset.egg");
      check(egg === 'live', `the live egg again once the aim's settle is over: ${egg}`);
      // Released at an overdue level: it rings then.
      await drag(tab, [0], true);
      s = await corrected(tab, null);
      s = await tab.phase('PULL');
      check(rings((await tab.osc()).slice(base)).length >= 1, 'rang on release');
      return 'held through runny: no ring, the aim drawn; back and released: nothing; released runny: Pull, rang';
    },
  },

  'start-time': {
    what: "the start corrected in its clause's panel, a minute at a time, and stopped with its reason at now, the boil pressed, and two hours back",
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'cold');
      const id_s = (s.cook?.id_ms ?? 0) / 1000;
      const start0 = s.cook?.startedAt_s ?? 0;
      await tab.shift(150);
      await tab.click('#sentence .clause[aria-controls="panelStart"]');
      const clock = await panelStart(tab);
      check(clock === await clockAt(tab, start0), `the panel says when: "${clock}"`);
      // + three times, a tap each: the third goes no further than now.
      for (let i = 0; i < 3; i++) await press(tab, '#startedAtMore');
      const limit = await tab.eval<string>("document.getElementById('startedAtLimit').textContent");
      const now = await tab.words('controls.startedAt.latestNow');
      check(limit === now, `the reason at now: "${limit}"`);
      s = await corrected(tab, null);
      const late = (s.cook?.startedAt_s ?? 0) - start0;
      check(near(late, 150, 1e-6), `in at now, 150 s on: ${late.toFixed(1)} s later`);
      const moved = await panelStart(tab);
      check(moved === await clockAt(tab, s.cook?.startedAt_s ?? 0), `the panel follows: "${moved}"`);
      // The boil pressed, then + again: no later than the press.
      await tab.shift(240);
      s = await boil(tab);
      const tap = s.cook?.events.boilAt_s ?? 0;
      await tab.shift(60);
      for (let i = 0; i < 5; i++) await press(tab, '#startedAtMore');
      const atBoil = await tab.eval<string>("document.getElementById('startedAtLimit').textContent");
      check(atBoil.includes(await tab.timeOfDay(tap * 1000)),
        `the reason at the boil names its time: "${atBoil}"`);
      s = await corrected(tab, s);
      check(s.cook?.startedAt_s === tap, `in at the press: ${(s.cook?.startedAt_s ?? 0) - tap}`);
      // − all the way back, by the keyboard: two hours before Start was pressed.
      await later(tab);
      await tab.eval(`(() => { const b = document.getElementById('startedAtLess');
        for (let i = 0; i < 140; i++) b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })); })()`);
      const early = await tab.eval<string>("document.getElementById('startedAtLimit').textContent");
      s = await corrected(tab, s);
      check(near(s.cook?.startedAt_s ?? 0, id_s - 7200, 1e-6), `two hours back: ${((s.cook?.startedAt_s ?? 0) - id_s).toFixed(1)} s`);
      return `"${clock}" → "${moved}"; "${limit}"; "${atBoil}"; "${early}"`;
    },
  },

  'settings-mid-cook': {
    what: 'Settings is open while a cook runs; its water corrects the cook; the pull brings the egg back',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      const pull0 = deadlines(await tab.snap()).cookEnd_s;
      await tab.click('#settingsLink');
      await tab.until("document.body.dataset.view === 'settings' && document.getElementById('litres').offsetParent !== null", 'Settings open');
      const learned = await tab.eval<boolean>("document.getElementById('learned').offsetParent === null");
      check(learned, 'what I have learned waits for the cook to end');
      for (let i = 0; i < 4; i++) await press(tab, 'button.step[data-for="litres"][data-up="0"]');
      s = await corrected(tab, null);
      const water = storedCook(s)?.choices.waterLitres;
      check(water === 1, `the cook's water: ${water}`);
      const pull1 = deadlines(s).cookEnd_s;
      check(pull1 !== pull0, `the pull moved: ${(pull1 - pull0).toFixed(1)} s`);
      const saved = JSON.parse((await tab.storage(SETTINGS_KEY)) ?? '{}') as { waterLitres?: number };
      check(saved.waterLitres === 1, `the next cook's water: ${saved.waterLitres}`);
      await tab.shiftTo(pull1 + 1);
      await tab.phase('PULL');
      await tab.until("document.body.dataset.view === 'egg'", 'the egg\'s page at the pull');
      return `water 2 → 1 L: the pull ${(pull1 - pull0).toFixed(1)} s; the egg's page at the pull`;
    },
  },

  'record-corrected-at-done': {
    what: 'a correction at Done changes the record, planned on the calibration before this egg: changed back, the record is the first to the bit',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      await tab.shiftTo(deadlines(s).cookEnd_s + 2);
      await tab.phase('PULL');
      await tab.click('#primary');
      s = await tab.phase('COOLING');
      await tab.shiftTo(deadlines(s).coolEnd_s + 2);
      await tab.phase('DONE');
      await tab.click('.fb[data-yolk="runny"]');
      await tab.until('__snap().eggsLogged === 1', 'Runny folded');
      const first = (await tab.snap()).log[0];
      const peak0 = await tab.eval<string>("document.getElementById('donenessPeak').textContent");
      await pick(tab, '#size', '3');
      s = await corrected(tab, null);
      await tab.until(`JSON.stringify(__snap().log[0].egg) !== ${JSON.stringify(JSON.stringify(first.egg))}`,
        'the record corrected');
      const heavier = (await tab.snap()).log[0];
      check(heavier.yolkWord === 'runny', `the answer kept: ${heavier.yolkWord}`);
      check(heavier.recommended_s === first.recommended_s, 'the time that ran is the time that ran');
      check(JSON.stringify(heavier.forecast) !== JSON.stringify(first.forecast), 'the forecast is the heavier egg\'s');
      await later(tab);
      await pick(tab, '#size', '2');
      s = await corrected(tab, s);
      await tab.until(`JSON.stringify(__snap().log[0].egg) === ${JSON.stringify(JSON.stringify(first.egg))}`,
        'the record back');
      await tab.until("__snap().eggsLogged === 1 && __snap().eggsBehind === 0",
        'folded again');
      const back = (await tab.snap()).log[0];
      check(JSON.stringify(back.forecast) === JSON.stringify(first.forecast),
        `changed back, the forecast is the first, not one that knew Runny: ${JSON.stringify(back.forecast)} vs ${JSON.stringify(first.forecast)}`);
      await tab.settle();
      const peak1 = await tab.eval<string>("document.getElementById('donenessPeak').textContent");
      check(peak1 === peak0, `Done shows the cook as it ran: "${peak1}" (was "${peak0}")`);
      return `heavier: a new forecast, the answer kept; back: the first forecast to the bit, "${peak1}"`;
    },
  },

  'slider-after-pull': {
    what: 'after the pull the slider only previews: no correction, no record changed, and back to the level the egg ran at',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      const level = String(s.cook?.choices.level);
      await tab.shiftTo(deadlines(s).cookEnd_s + 2);
      await tab.phase('PULL');
      await tab.click('#primary');
      s = await tab.phase('COOLING');
      await tab.shiftTo(deadlines(s).coolEnd_s + 2);
      await tab.phase('DONE');
      await tab.click('.fb[data-yolk="jammy"]');
      await tab.until('__snap().eggsLogged === 1', 'Jammy folded');
      const first = JSON.stringify((await tab.snap()).log[0]);
      await drag(tab, [0.6, 0.9]);
      await tab.until("document.getElementById('eggSection').dataset.egg === 'aim'", 'the aim while held');
      await drag(tab, [0.9], true, false);
      await tab.settle();
      const egg = await tab.eval<string>("document.getElementById('eggSection').dataset.egg");
      check(egg === 'ran', `the egg as it ran again once the aim's settle is over: ${egg}`);
      s = await tab.snap();
      check(s.cook?.correctedAt_s === null, `no correction: ${s.cook?.correctedAt_s}`);
      check(JSON.stringify(s.log[0]) === first, 'the record as it was');
      const thumb = await tab.eval<string>("document.getElementById('doneness').value");
      check(thumb === level, `the slider back at ${level}: ${thumb}`);
      return `dragged to 0.9 and let go: aim drawn, no correction, the record as it was, the slider back at ${thumb}`;
    },
  },

  'still-in-water': {
    what: 'a correction after the grace ran out asks "still in the water?"; nothing past it rings or shows; each answer',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      const words = (key: string): Promise<string> => tab.words(key);
      const ask = await words('ask.stillIn');
      // The alarm rang and its grace ran out, unanswered: the clock assumed
      // the egg came out. Then the cook says it went into cold water.
      const asked = async (): Promise<Snap> => {
        let s = await start(tab, 'hot');
        await tab.until('__snap().decided', 'the pot planned');
        s = await tab.snap();
        await tab.shiftTo(deadlines(s).cookEnd_s + 25);
        s = await tab.phase('COOLING');
        check(storedCook(s)?.events.pulled?.by === 'timeout', 'the clock assumed the pull');
        await tab.click('#startCold');
        await corrected(tab, null);
        await tab.until(`__snap().label === ${JSON.stringify(ask)}`, 'the question');
        return tab.snap();
      };
      let s = await asked();
      const osc0 = (await tab.osc()).length;
      check(s.primary === await words('ask.stillIn.yes'), `yes: ${s.primary}`);
      check(await tab.eval<boolean>("!document.getElementById('stillOut').hidden"), 'no, on screen');
      // Nothing past the question: not the white's line, a caveat about the
      // pull it doubts.
      check(await tab.eval<boolean>("document.getElementById('whiteRisk').hidden"), 'no white\'s line under the question');
      // The cooling's counted end passes under the question: nothing.
      await tab.shift(600);
      await tab.settle();
      s = await tab.snap();
      check(s.phase === 'COOLING' && s.label === ask && !s.feedback, `nothing past the question: ${s.phase}, "${s.label}"`);
      check(await tab.eval<boolean>("document.getElementById('whiteRisk').hidden"), 'no white\'s line under the question, settled');
      check(storedCook(s)?.events.cooledAt_s === null, 'no cooling written');
      check((await tab.osc()).length === osc0, 'nothing rang');
      await tab.click('#primary');
      s = await tab.phase('HEATING');
      check(storedCook(s)?.events.pulled === null, 'still in: the assumed pull dropped');
      const yes = `still in: Heating again, "${s.primary}"`;
      // Again, and the other answer.
      await tab.click('#secondary');
      await tab.phase('IDLE');
      await tab.click('#startHot');
      s = await asked();
      await tab.click('#stillOut');
      await tab.until(`__snap().label !== ${JSON.stringify(ask)}`, 'the question answered');
      s = await tab.snap();
      const pulled = storedCook(s)?.events.pulled;
      check(pulled?.by === 'timeout' && pulled.confirmed, `out: the pull stands, confirmed: ${JSON.stringify(pulled)}`);
      check(s.phase === 'COOLING' || s.phase === 'DONE', `out: ${s.phase}`);
      await tab.until('__snap().cook.asRan?.correctedAt_s === __snap().cook.correctedAt_s',
        'the record made again for cold water');
      return `${yes}; out: ${s.phase}, the pull confirmed, the record corrected`;
    },
  },

  'start-again-corrected': {
    what: 'a correction at Done, then Start again at once, logs and keeps the corrected egg',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      await tab.shiftTo(deadlines(s).cookEnd_s + 2);
      await tab.phase('PULL');
      await tab.click('#primary');
      s = await tab.phase('COOLING');
      await tab.shiftTo(deadlines(s).coolEnd_s + 2);
      await tab.phase('DONE');
      await tab.click('.fb[data-yolk="jammy"]');
      await tab.until('__snap().eggsLogged === 1', 'Jammy folded');
      const first = JSON.stringify((await tab.snap()).log[0].egg);
      await later(tab);
      // A clause tapped, then Start again while the change is still settling.
      await pick(tab, '#size', '3');
      await tab.click('#primary');
      await tab.until(`await (async () => { const s = __snap(); return s.phase === 'IDLE' && s.stored === null
        && s.log.length === 1 && JSON.stringify(s.log[0].egg) !== ${JSON.stringify(first)}; })()`,
      'the corrected egg logged, then the cook forgotten');
      s = await tab.snap();
      check(s.log[0].yolkWord === 'jammy', `the answer kept: ${s.log[0].yolkWord}`);
      return `logged ${first} became ${JSON.stringify(s.log[0].egg)}, Jammy kept, then forgotten`;
    },
  },

  'done-stays-done': {
    what: 'after Done and an answer, the cooling corrected to ice keeps Done, its questions and its silence',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      await tab.click('#coolCounter');
      await tab.until("__snap().settings.cooling === 'counter'", 'the counter chosen');
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      await tab.shiftTo(deadlines(s).cookEnd_s + 2);
      await tab.phase('PULL');
      await tab.click('#primary');
      s = await tab.phase('DONE');
      const out_s = storedCook(s)?.events.pulled?.out_s ?? 0;
      await tab.shift(60);
      await tab.click('.fb[data-yolk="jammy"]');
      await tab.until('__snap().eggsLogged === 1', 'Jammy folded');
      await tab.settle();
      const osc0 = (await tab.osc()).length;
      await tab.shift(5);
      await tab.click('#coolIce');
      s = await corrected(tab, null);
      await tab.settle();
      s = await tab.snap();
      check(s.phase === 'DONE' && s.feedback, `Done kept, the questions shown: ${s.phase} "${s.label}", ${s.feedback}`);
      check((await tab.osc()).length === osc0, `nothing rang: ${(await tab.osc()).length - osc0}`);
      const cooled = storedCook(s)?.events.cooledAt_s ?? null;
      check(cooled !== null && cooled - out_s <= 65 + 1e-6, `the cooling ended by the correction: ${cooled === null ? null : cooled - out_s}`);
      await tab.until('__snap().log[0].cooled_s > 0', 'the record corrected');
      const rec = (await tab.snap()).log[0] as Rec & { cooled_s: number };
      check(rec.cooled_s <= 65 + 1e-6, `the record's ice bath no longer than till the correction: ${rec.cooled_s}`);
      // The alarm's grace ran out, the cooling ended, Jammy answered; then
      // corrected to cold water: an egg answered about came out, so the pull
      // stands and nothing asks whether it is still in the water.
      await tab.click('#primary');
      await tab.phase('IDLE');
      await tab.click('#coolIce');
      s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      await tab.shiftTo(deadlines(s).cookEnd_s + 25);
      s = await tab.phase('COOLING');
      await tab.shiftTo(deadlines(s).coolEnd_s + 5);
      await tab.phase('DONE');
      await tab.click('.fb[data-yolk="jammy"]');
      await tab.until('__snap().eggsLogged === 2', 'Jammy folded');
      await tab.shift(5);
      await tab.click('#startCold');
      s = await corrected(tab, null);
      await tab.settle();
      s = await tab.snap();
      check(s.phase === 'DONE' && s.feedback, `answered, then cold: ${s.phase} "${s.label}", questions ${s.feedback}`);
      check(storedCook(s)?.events.pulled?.confirmed === true, 'the pull stands');
      return `Done kept; cooled ${(cooled ?? 0) - out_s} s; the record's ice bath ${rec.cooled_s.toFixed(1)} s; `
        + 'answered, then cold: Done, the pull standing';
    },
  },

  'grace-correction': {
    what: 'a correction in the grace that leaves the pull due keeps the grace\'s end and rings nothing more',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      const pull0 = deadlines(await tab.snap()).cookEnd_s;
      await tab.shiftTo(pull0 + 15);
      let s = await tab.phase('PULL');
      await tab.settle();
      const osc0 = (await tab.osc()).length;
      await pick(tab, '#size', '1');
      s = await corrected(tab, null);
      await tab.settle();
      s = await tab.snap();
      check(s.phase === 'PULL' && near(deadlines(s).cookEnd_s, pull0, 1e-6),
        `a lighter egg in the grace: ${s.phase}, the pull ${(deadlines(s).cookEnd_s - pull0).toFixed(1)} s from the one that rang`);
      check((await tab.osc()).length === osc0, `nothing rang again: ${(await tab.osc()).length - osc0}`);
      await tab.shiftTo(pull0 + 21);
      s = await tab.phase('COOLING');
      const p = storedCook(s)?.events.pulled;
      check(p?.by === 'timeout' && near(p.due_s, pull0, 1e-6), `the grace ended where it began: ${JSON.stringify(p)}`);
      return `lighter at +15 s: Pull, the pull kept, nothing rung; +21 s: Cooling, due at the pull that rang`;
    },
  },

  'change-kept-on-hide': {
    what: 'a change still settling is committed when the page goes, and two changes commit apart by keyboard too',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      await tab.shift(30);
      await pick(tab, '#size', '3');
      await tab.reload();
      let s = await tab.phase('COOKING');
      check(s.cook?.choices.mass_kg !== 0.068 && s.cook?.correctedAt_s !== null, `reloaded: ${s.cook?.choices.mass_kg}`);
      const saved = JSON.parse((await tab.storage(SETTINGS_KEY)) ?? '{}') as { sizeIndex?: number };
      check(saved.sizeIndex === 3, `the next cook's egg: ${saved.sizeIndex}`);
      // Two changes in a row with no pointer, as a keyboard makes them.
      await later(tab);
      const w0 = (await tab.writes()).length;
      await pick(tab, '#size', '1');
      await tab.click('#coolTap');
      await tab.until("__snap().storedCook?.choices.cooling === 'tap'", 'the second committed');
      await tab.settle();
      const cooks = (await tab.writes()).slice(w0).filter((w) => w.key === COOK_KEY)
        .map((w) => cookIn(w.value)?.choices).filter((c) => c !== undefined);
      const firstAlone = cooks.some((c) => c.mass_kg !== s.cook?.choices.mass_kg && c.cooling === 'ice');
      check(firstAlone, `the first committed without the second: ${JSON.stringify(cooks.map((c) => [c.mass_kg, c.cooling]))}`);
      return `the size kept across a reload; then ${cooks.length} writes, the first change alone first`;
    },
  },
};
