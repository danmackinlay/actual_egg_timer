/**
 * The one screen's layout and what it reads: the screen at two widths from
 * idle to Done, the egg's readings, the likely band, the sentence and the
 * likely time range. Run by tools/e2e.ts.
 */

import { wordBandHigh, wordBandLow } from '../../src/core/certainty.ts';
import { Failure, type Scenario, type Snap, byId, check } from '../harness.ts';
import {
  COOLINGS, STOPPED, boil, clockAt, corrected, deadlines, later, near, oneLayout, panelStart, pick, sentenceSays,
  setSlider, start,
} from './helpers.ts';

export const layoutScenarios: Record<string, Scenario> = {
  'one-layout': {
    what: 'one layout from idle to Done at 390 px; the action under the time, nothing below it moving; Cancel beside the main button and nothing empty under the row, or, where the fonts set the words too wide for that, the two stacked; the row sized on the chosen cooling\'s pull alone',
    run: oneLayout(390, null),
  },

  'one-layout-narrow': {
    what: 'at 320 px, cooled in a bowl of water, the main button and Cancel stack, and the action keeps its height from idle to Done, so nothing below it moves; the row sized on the chosen cooling\'s pull alone',
    // The bowl: its pull stacks at 320 px in every font, by 54 px in
    // Apple's; the ice bath fits there in Apple's by 2 px.
    run: oneLayout(320, 'stacked', COOLINGS[2]),
  },

  'egg-readings': {
    what: 'the egg aimed for at idle (softer and firmer differ), the live egg from raw at the start, the egg as it ran at Done',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      const centre = async (): Promise<{ reading: string; fill: string }> => tab.eval(`(() => {
        const svg = ${byId('eggSection')};
        return { reading: svg.dataset.egg ?? '', fill: svg.querySelector('path[data-ring="0"]')?.getAttribute('fill') ?? '' };
      })()`);
      const at = async (level: number): Promise<{ reading: string; fill: string }> => {
        await setSlider(tab, level);
        await tab.until(`await (async () => { const st = __snap();
          return st.chosen !== null && st.chosen.level === st.settings.doneness
            && Math.abs(st.settings.doneness - ${level}) < 0.1; })()`, `level ${level} decided`);
        await tab.settle();
        return centre();
      };
      const runny = await at(0.1);
      const hard = await at(0.95);
      check(runny.reading === 'aim' && hard.reading === 'aim', `idle reads the aim: ${runny.reading}, ${hard.reading}`);
      check(runny.fill !== hard.fill, `a runny and a hard yolk drawn alike: ${runny.fill}`);
      await at(0.41);
      const aimed = await centre();
      let s = await start(tab, 'hot');
      await tab.settle();
      const live = await centre();
      check(live.reading === 'live', `the cook reads live: ${live.reading}`);
      check(live.fill !== aimed.fill, `the live egg starts raw, not as aimed: ${live.fill}`);
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      await tab.shiftTo(deadlines(s).cookEnd_s + 2);
      await tab.phase('PULL');
      await tab.click('#primary');
      s = await tab.phase('COOLING');
      check((await centre()).reading === 'live', 'cooling reads live');
      await tab.shiftTo(deadlines(s).coolEnd_s + 2);
      await tab.phase('DONE');
      await tab.settle();
      const ran = await centre();
      check(ran.reading === 'ran', `Done reads the egg as it ran: ${ran.reading}`);
      return `idle runny ${runny.fill}, hard ${hard.fill}; start ${live.fill}; Done ${ran.fill}`;
    },
  },

  'likely-band': {
    what: 'UI.md 8: the bracket is heavier over the most likely word\'s band, the thumb inside it when that is the word asked (the owner\'s Heating)',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      // Where the bracket and its heavy stretch are drawn, as levels: their
      // edges over the width the slider's levels span (styles.css insets
      // the bracket's row as the track is).
      const drawn = async (): Promise<{ bracket: [number, number]; band: [number, number] }> => tab.eval(`(() => {
        const row = document.querySelector('.slider__range').getBoundingClientRect();
        const at = (e) => { const r = e.getBoundingClientRect();
          return [(r.left - row.left) / row.width, (r.right - row.left) / row.width]; };
        return { bracket: at(${byId('donenessBracket')}), band: at(${byId('donenessLikelyBand')}) };
      })()`);
      const seen: string[] = [];
      let differs = 0;
      const bandAt = async (level: number, s: Snap): Promise<void> => {
        const w = s.certainty?.words;
        if (w === undefined) throw new Failure(`no certainty at ${level}`);
        const { bracket, band } = await drawn();
        const want = [wordBandLow(w.mostLikely), wordBandHigh(w.mostLikely)];
        // A pixel of the row is about 0.003 of it on a phone.
        check(near(band[0], want[0]!, 0.004) && near(band[1], want[1]!, 0.004),
          `at ${level} the band is ${band.map((x) => x.toFixed(3))}, not word ${w.mostLikely}'s ${want}`);
        check(band[0] >= bracket[0] - 1e-3 && band[1] <= bracket[1] + 1e-3,
          `at ${level} the band ${band.map((x) => x.toFixed(3))} overruns the bracket ${bracket.map((x) => x.toFixed(3))}`);
        if (w.mostLikely === w.asked) {
          check(band[0] <= level && level <= band[1], `at ${level} the most likely word is the word asked, and the thumb is outside its band`);
        } else {
          differs += 1;
        }
        seen.push(`${level}: ${w.mostLikely}${w.mostLikely === w.asked ? '' : ` (asked ${w.asked})`}`);
      };
      // The owner's: a 68 g egg at room temperature, cold start, under cold
      // running water, the slider at 0.30, 5:08 into the heating. The
      // certainty is the plan's, so it is read while the cook runs.
      await pick(tab, '#size', '2');
      await tab.click('#tempRoom');
      await tab.click('#coolTap');
      await setSlider(tab, 0.3);
      await tab.until(`await (async () => { const st = __snap();
        return st.chosen !== null && st.chosen.level === 0.3 && st.settings.cooling === 'tap'; })()`, 'the owner\'s egg decided');
      let s = await start(tab, 'cold');
      check(s.settings.sizeIndex === 2 && s.settings['startTempMode'] === 'room', `the owner's egg: ${JSON.stringify(s.settings)}`);
      await tab.until('__snap().deadlines !== null', 'planned');
      await tab.shift(308);
      await tab.settle();
      s = await tab.phase('HEATING');
      await bandAt(0.3, s);
      const owner = s.subline;
      // Then the default, and on through a level whose most likely word is
      // firmer than the word asked.
      for (const level of [0.41, 0.5, 0.6, 0.85]) {
        await later(tab);
        await setSlider(tab, level);
        s = await corrected(tab, s);
        await tab.settle();
        await bandAt(level, await tab.snap());
      }
      check(differs > 0 && differs < seen.length, `the most likely word never came apart from the word asked and back: ${seen.join(', ')}`);
      return `${owner}; ${seen.join(', ')}`;
    },
  },

  'sentence-no-time': {
    what: "the sentence never says when the eggs went in, idle, heating, cooking or corrected to the heat off; the start's panel does",
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      await tab.until("__snap().chosen !== null", 'the time decided');
      await tab.settle();
      const idle = await sentenceSays(tab);
      const cold = await tab.words('setup.start.cold');
      const noTime = (where: string, said: { sentence: string; clause: string }, clause: string): void => {
        check(!/\d:\d\d/.test(said.sentence), `${where}: a time in the sentence: "${said.sentence}"`);
        check(said.clause === clause, `${where}: the start clause "${said.clause}", not "${clause}"`);
      };
      noTime('idle', idle, cold);
      let s = await start(tab, 'cold');
      await tab.settle();
      const heating = await sentenceSays(tab);
      noTime('heating', heating, cold);
      check(heating.sentence === idle.sentence, `heating: "${heating.sentence}", idle "${idle.sentence}"`);
      await tab.shift(300);
      s = await boil(tab);
      await tab.settle();
      const cooking = await sentenceSays(tab);
      noTime('cooking', cooking, cold);
      check(cooking.sentence === idle.sentence, `cooking: "${cooking.sentence}"`);
      // The start's panel says it.
      await tab.click('#sentence .clause[aria-controls="panelStart"]');
      const clock = await panelStart(tab);
      check(clock === await clockAt(tab, s.cook?.startedAt_s ?? 0), `the panel says when: "${clock}"`);
      // Corrected to the heat off: the clause says so, still with no time.
      await later(tab);
      await tab.click('#heatOff');
      s = await corrected(tab, null);
      await tab.settle();
      const standing = await sentenceSays(tab);
      noTime('the heat off', standing,
        await tab.words('setup.start.coldStanding'));
      return `"${cooking.sentence}"; the panel "${clock}"; "${standing.clause}"`;
    },
  },

  'certainty-mid-cook': {
    what: 'once the cook runs, the likely time range is when to take them out, and moves with a slow hob',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      await tab.shift(300);
      await tab.click('#certaintyWord');
      await tab.settle();
      const line = `${byId('certaintyTime')}.textContent`;
      // The times of day the eggs come out between, from this plan's range.
      const want = await tab.eval<string>(`(() => { const s = __snap(); const r = s.certainty.time; const t0 = s.cook.startedAt_s;
        return aetTest.t('certainty.timeOut', { low: aetTest.timeOfDay((t0 + r.low_s) * 1000), high: aetTest.timeOfDay((t0 + r.high_s) * 1000) }); })()`);
      const cooking = await tab.eval<string>(line);
      check(cooking === want, `cooking, ${(await tab.snap()).digits} left: "${cooking}", want "${want}"`);
      await tab.click('#secondary');
      await tab.phase('IDLE');
      // Cold and never tapped: the slow hob lengthens the guess.
      await tab.click('#startCold');
      s = await start(tab, 'cold');
      await tab.until('__snap().decided', 'the guessed pot planned');
      const start_s = s.cook?.startedAt_s ?? 0;
      await tab.shiftTo(start_s + 16 * 60);
      await tab.settle();
      s = await tab.phase('HEATING');
      check(s.lengthened, 'the slow hob lengthened');
      check(await tab.eval<boolean>(`!${byId('certaintyMore')}.hidden && ${byId('certaintyMore')}.contains(${byId('certaintyTime')})`),
        'the range shown');
      const at16 = await tab.eval<string>(line);
      const pull16 = deadlines(s).cookEnd_s;
      // Four minutes on, as the iOS scenario steps. The times are said to
      // the minute and the cook started at the real clock's second, so the
      // line is sure to change only if the guess moved a whole minute: 65 s
      // on it moved about 38 s, and the line stayed put one start in five.
      await tab.shiftTo(start_s + 20 * 60);
      await tab.settle();
      s = await tab.phase('HEATING');
      const moved_s = deadlines(s).cookEnd_s - pull16;
      check(s.lengthened && moved_s >= 60, `the guess a minute later or more: ${moved_s.toFixed(1)} s`);
      const at20 = await tab.eval<string>(line);
      check(at20 !== at16, `the range moved with the guess: still "${at16}"`);
      return `cooking: "${cooking}"; heating 16:00: "${at16}"; 20:00: "${at20}"`;
    },
  },
};
