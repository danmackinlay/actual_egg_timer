/**
 * The record and sharing: answers after Done and a reload, an egg made final,
 * a probe reading, and what is sent. Run by tools/e2e.ts.
 */

import { type Scenario, check } from '../harness.ts';
import { COOK_KEY, STOPPED, deadlines, later, pick, start } from './helpers.ts';

export const recordScenarios: Record<string, Scenario> = {
  'later-answer-refolds': {
    what: 'an answer after a correction at Done, when the egg cannot be folded again from before it, folds the whole log again rather than being refused',
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
      await tab.until('__snap().eggsLogged === 1 && __snap().eggsBehind === 0', 'Jammy folded');
      const first = JSON.stringify((await tab.snap()).log[0].egg);
      // A correction at Done: the egg logged is replaced, and the log folded
      // again from its start, so the fold before this egg is gone.
      await later(tab);
      await pick(tab, '#size', '3');
      await tab.until(`await (async () => { const s = __snap(); return s.log.length === 1 && s.eggsBehind === 0
        && JSON.stringify(s.log[0].egg) !== ${JSON.stringify(first)}; })()`, 'the corrected egg logged and folded');
      // The white, answered after it: it cannot be folded from the fold
      // before this egg, so the whole log is folded again with it.
      await later(tab);
      await tab.click('.wb[data-white="firm"]');
      await tab.until("__snap().log[0].white === 'firm' && __snap().eggsBehind === 0", 'Firm logged and folded');
      s = await tab.snap();
      check(s.log.length === 1, `one egg: ${s.log.length}`);
      check(s.log[0].yolkWord === 'jammy' && s.log[0].white === 'firm', `both answers kept: ${s.log[0].yolkWord}, ${s.log[0].white}`);
      check(s.eggsLogged === 1, `folded once, from the start: ${s.eggsLogged}`);
      check(s.feedback, 'the questions stay, the answer taken');
      check(await tab.eval<boolean>(`document.querySelector('.wb[data-white="firm"]').getAttribute('aria-pressed') === 'true'`),
        'Firm settled as said');
      return `Jammy, a correction (${first} became ${JSON.stringify(s.log[0].egg)}), then Firm: both in the log, folded from the start`;
    },
  },

  'done-note-as-ran': {
    what: 'Done after an answer and a reload, the texture note is the cook as it ran',
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
      await tab.settle();
      const note = "document.getElementById('note').textContent";
      const before = await tab.eval<string>(note);
      await tab.click('.fb[data-yolk="runny"]');
      await tab.until('__snap().eggsLogged === 1', 'Runny folded');
      await tab.reload();
      await tab.until('__snap().decided', 'planned on the new posterior');
      await tab.settle();
      const after = await tab.eval<string>(note);
      check(after === before, `"${before}" became "${after}"`);
      return `"${after}" kept`;
    },
  },

  'final-egg': {
    what: 'an egg final by the clock takes no more answers',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      await tab.shiftTo(deadlines(s).cookEnd_s + 25);
      s = await tab.phase('COOLING');
      await tab.shiftTo(deadlines(s).coolEnd_s + 5);
      s = await tab.phase('DONE');
      await tab.click('.fb[data-yolk="jammy"]');
      await tab.until('__snap().log.length === 1', 'Jammy logged');
      const final0 = await tab.eval<number>('__snap().finalEggs');
      check(final0 === 0, `open at Done: ${final0} final`);
      await tab.eval('window.aetClock.shift(3 * 3600)');
      const final1 = await tab.eval<number>('__snap().finalEggs');
      check(final1 === 1, `three hours on: ${final1} final`);
      await tab.click('.wb[data-white="tender"]');
      await tab.settle();
      s = await tab.snap();
      check(s.log.length === 1 && s.log[0].white === null, `Tender not taken: ${s.log[0].white}`);
      check(!s.feedback, 'the questions put away');
      await tab.look();
      s = await tab.phase('IDLE');
      check(s.log.length === 1, 'nothing logged twice');
      return 'final 0 at Done, 1 three hours on; Tender not taken; the cook ended on the next look';
    },
  },

  'probe-reading': {
    what: 'a probe reading at Done: one no kitchen could make refused with its range, a believable one scored on the egg\'s record and logged',
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
      s = await tab.phase('DONE');
      const field = await tab.eval<{ shown: boolean; placeholder: string }>(`(() => ({
        shown: !document.getElementById('probeEntry').hidden,
        placeholder: document.getElementById('probeReading').placeholder }))()`);
      check(field.shown && field.placeholder !== '', `the probe's field, from the peak: ${JSON.stringify(field)}`);
      const save = (typed: string): Promise<void> => tab.eval(`(() => {
        document.getElementById('probeReading').value = ${JSON.stringify(typed)};
        document.getElementById('probeSave').click(); })()`);
      // Freezing, in either unit: no kitchen makes it.
      await save('0');
      await tab.settle();
      const refused = await tab.eval<string>("document.getElementById('probeNote').textContent");
      s = await tab.snap();
      check(s.log.length === 0 && s.cook !== null && JSON.stringify(s.cook).indexOf('"probe":{') < 0,
        `0 refused, nothing logged: ${s.log.length}`);
      check(refused !== '' && refused !== '0', `the range said: "${refused}"`);
      // The peak the field suggests: taken, and logged with the egg.
      await save(field.placeholder);
      await tab.until('__snap().log.length === 1', 'the reading logged');
      s = await tab.snap();
      const probe = (s.log[0] as unknown as { probe: { centre_C: number } | null }).probe;
      const peak = s.peakYolk_C ?? 0;
      check(probe !== null && Math.abs(probe.centre_C - peak) < 1, `logged ${JSON.stringify(probe)} for a peak of ${peak.toFixed(1)} °C`);
      const settled = await tab.eval<boolean>("document.getElementById('probeReading').disabled");
      check(settled, 'the field settled on the reading');
      return `refused 0: "${refused}"; ${field.placeholder} logged as ${probe?.centre_C} °C`;
    },
  },

  'done-as-ran': {
    what: 'Done after an answer and a reload shows the cook as it ran',
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
      s = await tab.phase('DONE');
      await tab.until('__snap().target !== ""', 'what was asked for');
      // The slider's heading, the cook's peak yolk (the one screen keeps the
      // slider where the summary under the sentence was).
      const summary = "document.getElementById('donenessPeak').textContent";
      const before = await tab.eval<string>(summary);
      const asked = (await tab.snap()).target;
      check(asked.includes(before), `"${asked}" and "${before}" agree`);
      await tab.click('.fb[data-yolk="runny"]');
      await tab.until('__snap().eggsLogged === 1', 'Runny folded');
      await tab.reload();
      await tab.until('__snap().decided', 'planned on the new posterior');
      s = await tab.snap();
      check(s.phase === 'DONE', `reloaded to ${s.phase}`);
      const after = await tab.eval<string>(summary);
      // What the plan made now, on the posterior that has folded Runny, says.
      const now_C = (await tab.snap()).peakYolk_C ?? NaN;
      check(after === before, `"${before}" became "${after}"`);
      return `"${after}" kept (the plan now: peak yolk ${now_C.toFixed(1)} °C)`;
    },
  },

  'sharing-final-only': {
    what: 'sharing sends only final eggs: none at Done, the egg at Start again (real clock, the cook moved back)',
    run: async (h) => {
      const tab = await h.ctx.open('/');
      await tab.click('#shareSetting');
      await tab.until("__snap().share.on", 'sharing on');
      const posts0 = h.posts().length;
      await start(tab, 'hot');
      // The cook begun 20 minutes ago: every clock time in it moved back.
      const D = 20 * 60;
      await tab.goto(`${h.origin}/privacy/`, false);
      await tab.eval(`(() => {
        const o = JSON.parse(localStorage.getItem('${COOK_KEY}'));
        const c = o.cook;
        c.id_ms -= ${D * 1000};
        // The press and its start; the log is read, the rest folded from it.
        c.start.at_s -= ${D};
        for (const e of c.log) if (typeof e.at_s === 'number') e.at_s -= ${D};
        localStorage.setItem('${COOK_KEY}', JSON.stringify(o));
      })()`).catch(() => undefined);
      await tab.goto(`${h.origin}/`);
      await tab.phase('DONE');
      await tab.click('.fb[data-yolk="jammy"]');
      await tab.until('__snap().log.length === 1', 'Jammy logged');
      await tab.settle();
      check((await tab.sends()) === 0, `nothing sent while the egg is open: ${await tab.sends()} requests`);
      check(h.posts().length === posts0, `nothing sent while the egg is open: ${h.posts().slice(posts0).join('; ')}`);
      await tab.click('#primary');
      await tab.phase('IDLE');
      await tab.until("__snap().share.sent === 1", 'the egg sent');
      const sent = h.posts().slice(posts0);
      check(sent.length === 1 && sent[0].includes('201'), `one egg sent: ${sent.join('; ')}`);
      return `at Done: 0 sent; Start again: ${sent[0]}`;
    },
  },
};
