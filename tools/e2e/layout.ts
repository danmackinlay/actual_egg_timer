/**
 * The one screen's layout and what it reads: the screen at two widths from
 * idle to Done, the egg's readings, the likely band, the sentence and the
 * likely time range; and the egg's weight box, focused while the girth is
 * stepped, and typed in. Run by tools/e2e.ts.
 */

import { wordBandHigh, wordBandLow } from '../../src/core/certainty.ts';
import { eggFromMinorDiameter } from '../../src/core/geometry.ts';
import { Failure, type Scenario, type Snap, byId, check } from '../harness.ts';
import {
  COOLINGS, STOPPED, boil, clockAt, corrected, deadlines, later, near, oneLayout, panelStart, pick, press,
  sentenceSays, setSlider, start,
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

  'egg-heat-toggle': {
    what: 'DECISIONS.md 52: a tap on the egg shows how hot, named so and offering how set; a tap again shows how set; how hot is kept over a reload, and on into a cook, where the live egg is drawn how hot',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      await tab.until("__snap().chosen !== null", 'the time decided');
      await tab.settle();
      const egg = (): Promise<{ shows: string; reading: string; label: string; offer: string; fill: string; stored: unknown }> => tab.eval(`(() => {
        const svg = ${byId('eggSection')};
        const stored = JSON.parse(localStorage.getItem('aet.settings') ?? '{}');
        return {
          shows: svg.dataset.shows ?? '', reading: svg.dataset.egg ?? '',
          label: ${byId('eggToggle')}.getAttribute('aria-label') ?? '', offer: ${byId('eggToggleOffer')}.textContent ?? '',
          fill: svg.querySelector('path[data-ring="0"]')?.getAttribute('fill') ?? '', stored: stored.eggView ?? null,
        }; })()`);
      const tap = async (): Promise<void> => {
        await tab.click('#eggToggle');
        await tab.settle();
      };
      const set = await egg();
      check(set.shows === 'set' && set.label !== '' && set.offer !== '', `a fresh egg shows how set, named: ${JSON.stringify(set)}`);
      await tap();
      const heat = await egg();
      check(heat.shows === 'heat', `a tap shows how hot: ${heat.shows}`);
      check(heat.fill !== set.fill, `the centre drawn alike in both: ${heat.fill}`);
      check(heat.label !== set.label && heat.offer !== set.offer, `the name says how set still: ${heat.label} / ${heat.offer}`);
      check(heat.stored === 'heat', `how hot not stored: ${String(heat.stored)}`);
      await tap();
      const back = await egg();
      check(back.shows === 'set' && back.fill === set.fill && back.label === set.label, `a tap again is not how set: ${JSON.stringify(back)}`);
      await tap();
      await tab.reload();
      await tab.until("__snap().chosen !== null", 'the time decided again');
      await tab.settle();
      const kept = await egg();
      check(kept.shows === 'heat' && kept.label === heat.label, `how hot not kept over a reload: ${JSON.stringify(kept)}`);
      await start(tab, 'cold');
      await tab.until(`${byId('eggSection')}.dataset.egg === 'live'`, 'the live egg drawn');
      const live = await egg();
      check(live.shows === 'heat', `the live egg drawn how set: ${live.shows}`);
      return `set ${set.fill}, heat ${heat.fill}; kept over a reload; the live egg ${live.fill}`;
    },
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

  'focused-field-follows': {
    what: 'a field focused but not typed in follows the egg: + on the girth with the weight focused shows the new weight there, focused and once left; a box typed in keeps what was typed until it is left',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      await tab.until("__snap().chosen !== null", 'the time decided');
      await tab.settle();
      await tab.click('#sentence .clause[aria-controls="panelEgg"]');
      await tab.until(`${byId('measureMass')}.offsetParent !== null`, "the egg's panel open");
      const box = (): Promise<{ value: string; step: number; focused: boolean }> => tab.eval(`(() => {
        const e = ${byId('measureMass')};
        return { value: e.value, step: Number(e.step), focused: document.activeElement === e }; })()`);
      await tab.eval(`${byId('measureMass')}.focus()`);
      const before = await box();
      check(before.focused, 'the weight focused');
      await press(tab, 'button.step[data-for="measureGirth"][data-up="1"]');
      await tab.until("__snap().settings.measuredBy === 'girth'", 'the girth measured');
      await tab.settle();
      // The weight the model now has, from the egg's width as the girth
      // stepped it: the box shows it to its step.
      const minor_mm = (await tab.snap()).settings['customMinor_mm'] as number;
      const want_g = eggFromMinorDiameter(minor_mm / 1000).mass_kg * 1000;
      const shows = (b: { value: string; step: number }): boolean => near(Number(b.value), want_g, b.step / 2 + 1e-9);
      check(!near(Number(before.value), want_g, before.step),
        `the girth's + moved the egg less than a step of weight: ${before.value} g, now ${want_g.toFixed(2)} g`);
      const focused = await box();
      check(focused.focused, 'the weight still focused after the girth\'s +');
      check(shows(focused), `focused, the weight box shows ${focused.value} g, the egg ${want_g.toFixed(2)} g`);
      await tab.eval(`${byId('measureMass')}.blur()`);
      await tab.settle();
      await tab.snap();
      const left = await box();
      check(!left.focused && shows(left), `left, the weight box shows ${left.value} g, the egg ${want_g.toFixed(2)} g`);
      // Typed in, the box keeps what was typed while the cook is in it, and
      // shows the egg kept once left.
      await tab.eval(`(() => { const e = ${byId('measureMass')}; e.focus(); e.select();
        document.execCommand('insertText', false, '7'); })()`);
      await tab.settle();
      await tab.snap();
      const typing = await box();
      check(typing.focused && typing.value === '7', `typing, the weight box shows ${typing.value}`);
      await tab.eval(`${byId('measureMass')}.blur()`);
      await tab.settle();
      const kept_mm = (await tab.snap()).settings['customMinor_mm'] as number;
      const kept_g = eggFromMinorDiameter(kept_mm / 1000).mass_kg * 1000;
      const typedLeft = await box();
      check(near(Number(typedLeft.value), kept_g, typedLeft.step / 2 + 1e-9),
        `typed 7 and left, the weight box shows ${typedLeft.value} g, the egg ${kept_g.toFixed(2)} g`);
      return `the weight ${before.value} g, the girth's + with it focused: ${focused.value} g, then ${left.value} g once left `
        + `(the egg ${want_g.toFixed(2)} g); 7 typed, kept while typing, ${typedLeft.value} g once left`;
    },
  },

  'touch-targets': {
    what: 'at 390 and 320 px, every − and + in the egg\'s panel and in Settings takes a tap 44 px wide and tall, and its field still takes a tap at either edge; at both widths and at 100% and 130% text, no − or + takes a tap from any other control in a clause\'s panel or Settings; the sound pill keeps the page\'s 16 px gutter; a choice in Settings keeps 10 px either side of its words; no Settings row runs past the page\'s edge',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      await tab.until("__snap().chosen !== null", 'the time decided');
      await tab.settle();
      // Where a tap lands, read with elementFromPoint across each button's
      // middle and down its centre, in half pixels.
      const steppers = (): Promise<string[]> => tab.eval<string[]>(`(() => {
        const out = [];
        for (const b of document.querySelectorAll('button.step')) {
          if (b.offsetParent === null) continue;
          b.scrollIntoView({ block: 'center' });
          const r = b.getBoundingClientRect();
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          const span = (from, to, on) => { let lo = null, hi = null;
            for (let v = from; v <= to; v += 0.5) if (on(v)) { lo ??= v; hi = v; }
            return lo === null ? 0 : hi - lo + 0.5; };
          const w = span(r.left - 15, r.right + 15, (x) => document.elementFromPoint(x, cy) === b);
          const tall = span(r.top - 15, r.bottom + 15, (y) => document.elementFromPoint(cx, y) === b);
          const field = b.dataset.up === '1' ? b.previousElementSibling : b.nextElementSibling;
          const f = field.getBoundingClientRect();
          const whole = document.elementFromPoint(f.left + 0.5, cy) === field && document.elementFromPoint(f.right - 0.5, cy) === field;
          const name = b.dataset.for + (b.dataset.up === '1' ? ' +' : ' −');
          if (w < 44 || tall < 44) out.push(name + ' takes a tap ' + w + ' × ' + tall + ' px');
          if (!whole) out.push(name + ' takes a tap from its field');
        }
        return out; })()`);
      const gutter = (): Promise<number> => tab.eval<number>(`document.documentElement.clientWidth - ${byId('mute')}.getBoundingClientRect().right`);
      // Every other visible control under `root`, probed with
      // elementFromPoint across its own box, in half pixels: along its top,
      // middle and foot, and down its sides and centre. A point that lands
      // on a − or + (its hit area reaches past its drawn box) is a tap the
      // control has lost to it.
      const covered = (root: string): Promise<string[]> => tab.eval<string[]>(`(() => {
        const out = [];
        const controls = [...document.querySelector(${JSON.stringify(root)}).querySelectorAll(
          'button, input, select, textarea, output, label, a[href], [role="button"]')]
          .filter((c) => !c.matches('button.step, input[type="radio"], input[type="checkbox"]') && c.offsetParent !== null);
        for (const c of controls) {
          c.scrollIntoView({ block: 'center' });
          const r = c.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          let hit = null, n = 0;
          const at = (x, y) => {
            const s = document.elementFromPoint(x, y)?.closest('button.step');
            if (s && !c.contains(s)) { n++; hit ??= s; }
          };
          for (const y of [r.top + 0.25, (r.top + r.bottom) / 2, r.bottom - 0.25]) for (let x = r.left + 0.25; x < r.right; x += 0.5) at(x, y);
          for (const x of [r.left + 0.25, (r.left + r.right) / 2, r.right - 0.25]) for (let y = r.top + 0.25; y < r.bottom; y += 0.5) at(x, y);
          const name = c.id || c.getAttribute('aria-controls') || c.getAttribute('for') || c.dataset.copy || c.tagName.toLowerCase();
          if (hit !== null) out.push(name + ' loses ' + n + ' points to ' + hit.dataset.for + (hit.dataset.up === '1' ? ' +' : ' −'));
        }
        return out; })()`);
      // Each clause's panel open in turn, with each choice that shows a
      // number of its own; then Settings.
      const panels: [string, string[]][] = [
        ['panelEgg', []], ['panelFrom', ['tempCustom', 'tempRoom']], ['panelStart', ['heatOff']],
        ['panelCooling', ['coolTap', 'coolBowl', 'coolCounter']],
      ];
      const lost: string[] = [];
      for (const width of [390, 320]) {
        await tab.viewport(width);
        for (const text of ['100%', '130%']) {
          // The browser's text size: the default font size, which rem follows.
          await tab.eval(`document.documentElement.style.fontSize = '${text}'`);
          await tab.eval("location.hash = ''");
          await tab.until(`${byId('sentence')}.offsetParent !== null`, 'the egg\'s page shown');
          for (const [panel, choices] of panels) {
            await tab.eval(`(() => { const c = document.querySelector('#sentence .clause[aria-controls="${panel}"]');
              if (c.getAttribute('aria-expanded') !== 'true') c.click(); })()`);
            await tab.until(`document.getElementById('${panel}').offsetParent !== null`, `${panel} open`);
            for (const choice of [null, ...choices]) {
              if (choice !== null) await tab.eval(`document.getElementById('${choice}').click()`);
              await tab.settle();
              for (const l of await covered(`#${panel}`)) lost.push(`${width} px, ${text} text, ${panel}${choice === null ? '' : ` (${choice})`}: ${l}`);
            }
          }
          await tab.eval("location.hash = '#settings'");
          await tab.until(`${byId('altitude')}.offsetParent !== null`, 'Settings shown');
          await tab.settle();
          for (const l of await covered('#settings')) lost.push(`${width} px, ${text} text, Settings: ${l}`);
        }
      }
      check(lost.length === 0, `a − or + takes a tap from another control: ${lost.join('; ')}`);
      await tab.eval("document.documentElement.style.fontSize = ''");
      const said: string[] = [];
      for (const width of [390, 320]) {
        await tab.viewport(width);
        await tab.eval("location.hash = ''");
        await tab.until(`${byId('sentence')}.offsetParent !== null`, 'the egg\'s page shown');
        // Opened once; the clause would close it at the second width.
        await tab.eval(`(() => { const c = document.querySelector('#sentence .clause[aria-controls="panelEgg"]');
          if (c.getAttribute('aria-expanded') !== 'true') c.click(); })()`);
        await tab.until(`${byId('measureMass')}.offsetParent !== null`, "the egg's panel open");
        const egg = await steppers();
        check(egg.length === 0, `at ${width} px in the egg's panel: ${egg.join('; ')}`);
        const pill = await gutter();
        check(Math.abs(pill - 16) < 0.5, `at ${width} px the sound pill is ${pill} px from the edge`);
        await tab.eval("location.hash = '#settings'");
        await tab.until(`${byId('altitude')}.offsetParent !== null`, 'Settings shown');
        const settings = await steppers();
        check(settings.length === 0, `at ${width} px in Settings: ${settings.join('; ')}`);
        const cramped = await tab.eval<string[]>(`[...document.querySelectorAll('.setting .seg label')]
          .filter((l) => l.offsetParent !== null).flatMap((l) => {
            const range = document.createRange(); range.selectNodeContents(l);
            const words = range.getBoundingClientRect(), r = l.getBoundingClientRect();
            const room = Math.min(words.left - r.left, r.right - words.right) - 1;
            return room < 9.5 || l.scrollWidth > l.clientWidth ? [l.textContent + ' ' + room.toFixed(1) + ' px'] : []; })`);
        check(cramped.length === 0, `at ${width} px, words nearer their choice's edge than 10 px: ${cramped.join('; ')}`);
        // Nothing in a Settings row reaches past the row's right edge, and the
        // page scrolls only up and down.
        const over = await tab.eval<{ wide: number; seen: number; rows: string[] }>(`(() => {
          const rows = [];
          for (const s of document.querySelectorAll('#settings .setting')) {
            if (s.offsetParent === null) continue;
            const edge = s.getBoundingClientRect().right;
            for (const e of s.querySelectorAll('*')) {
              const r = e.getBoundingClientRect();
              if (r.width > 0 && r.right > edge + 0.5) rows.push((e.id || e.tagName.toLowerCase()) + ' ' + (r.right - edge).toFixed(1) + ' px past');
            }
          }
          return { wide: document.documentElement.scrollWidth - document.documentElement.clientWidth, seen: document.querySelectorAll('#settings .setting').length, rows: rows };
        })()`);
        check(over.seen > 0, 'no Settings row found');
        check(over.rows.length === 0 && over.wide <= 0, `at ${width} px Settings is ${over.wide} px too wide: ${over.rows.join('; ')}`);
        said.push(`${width} px: pill ${pill} px in`);
      }
      return `every − and + takes 44 px or more, its field whole, and no other control's tap; ${said.join(', ')}; Settings' choices keep 10 px, and its rows the page's width`;
    },
  },
};
