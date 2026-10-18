/**
 * The cook's flow: a cold start, a hot one, a bowl and an egg cup from Start to Done;
 * Cancel; a reload at every phase; a tab woken past the pull; the hob slow; a
 * cook too old, and one left at Done. Run by tools/e2e.ts.
 */

import type { ElementId } from '../../src/ui/dom.ts';
import { type Osc, type Rec, type Scenario, type Snap, byId, check, labelSays } from '../harness.ts';
import {
  BOIL_KEY, EN, STOPPED, boil, corrected, deadlines, later, near, pansIn, pick, rings, scheduledAhead, sentenceSays,
  setSlider, start, storedCook,
} from './helpers.ts';

export const cookScenarios: Record<string, Scenario> = {
  'cold-cook': {
    what: 'a cold cook: boil, pull, cooling, Done, Jammy, Start again; the ring ahead at x1 and x60; the record and its forecast',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      const real0 = Date.now();
      let s = await start(tab, 'cold');
      labelSays(s);
      // Four minutes of heating.
      await tab.shift(240);
      s = await boil(tab);
      labelSays(s);
      const d = deadlines(s);
      // The pull's ring, ahead on the audio clock: the last plan's, the
      // cook's seconds ahead, a stopped clock's steps taken as seconds.
      const ahead = (await tab.osc()).filter(scheduledAhead).slice(-1);
      check(ahead.length === 1, `the pull's ring scheduled ahead, ${ahead.length}`);
      const lead = (o: Osc, speed: number): string | null => {
        const want_s = (d.cookEnd_s * 1000 - o.page) / 1000 / speed;
        const got_s = (o.at ?? 0) - o.made;
        return near(got_s, want_s, 0.05) ? null : `the pull ${want_s.toFixed(2)} s of audio ahead at x${speed}, ${got_s.toFixed(2)}`;
      };
      const at1 = lead(ahead[0], 1);
      check(at1 === null, at1 ?? '');
      // At x60, a sixtieth of that: the clock run fast for an instant, the
      // ring it scheduled read, and the clock stopped at the moment again.
      const fast = await tab.eval<Osc[]>(`(() => { const T = window.aetClock.now(); window.aetClock.speed(60);
        const o = window.__osc.slice(-1); window.aetClock.speed(0); window.aetClock.set(T); return o; })()`);
      check(fast.length === 1 && fast.every(scheduledAhead), `the ring ahead at x60: ${fast.filter(scheduledAhead).length}`);
      const at60 = lead(fast[0], 60);
      check(at60 === null, at60 ?? '');
      // The last second before the pull, at the real clock's speed: the ring
      // ahead is sounding as the tick reaches the pull. The grace, 20 s of
      // it, is the margin for a slow machine to see the pull and stop.
      await tab.shiftTo(d.cookEnd_s - 1);
      const oscAtRun = await tab.eval<number>('(() => { window.aetClock.speed(1); return window.__osc.length; })()');
      await tab.phase('PULL');
      const stopped_s = await tab.eval<number>('window.aetClock.speed(0) / 1000');
      await tab.settle();
      s = await tab.snap();
      check(s.phase === 'PULL', `stopped in the pull's grace: ${s.phase}, ${(stopped_s - d.cookEnd_s).toFixed(1)} s past it`);
      labelSays(s);
      // Sounding on the audio clock as the pull came: nothing rung again.
      check(s.osc === oscAtRun, `the ring ahead rang the pull: ${s.osc - oscAtRun} more made`);
      await tab.click('#primary');
      s = await tab.phase('COOLING');
      labelSays(s);
      const out = storedCook(s)?.events.pulled;
      check(out?.by === 'cook' && out.confirmed, `the cook's tap out stored: ${JSON.stringify(out)}`);
      const oscBeforeDone = (await tab.osc()).length;
      await tab.shiftTo(deadlines(s).coolEnd_s + 1);
      s = await tab.phase('DONE');
      labelSays(s);
      await tab.settle();
      check(rings((await tab.osc()).slice(oscBeforeDone)).length === 1, "Done's ring");
      check(s.feedback, 'the questions at Done');
      const cook = storedCook(s);
      await tab.click('.fb[data-yolk="jammy"]');
      await tab.until('__snap().log.length === 1', 'the egg logged');
      s = await tab.snap();
      const rec = s.log[0];
      check(rec.id === cook?.id_ms, 'the record is the cook');
      check(rec.yolkWord === 'jammy' && rec.pulledBy === 'cook', `the record: ${rec.yolkWord}, ${rec.pulledBy}`);
      check(rec.forecast !== null && typeof rec.forecast === 'object', 'the record has its forecast');
      await tab.click('#primary');
      s = await tab.phase('IDLE');
      check(s.stored === null, 'Start again forgets the cook');
      check(s.log.length === 1, `one egg logged, ${s.log.length}`);
      const pans = pansIn(await tab.storage(BOIL_KEY));
      check(Object.keys(pans).length === 1, `the pan remembered: ${JSON.stringify(pans)}`);
      // The surfaces and the odds were built by the grid worker, off the
      // page's thread.
      check(s.gridJobs.offThread > 0 && s.gridJobs.onThread === 0, `the grid worker's jobs: ${JSON.stringify(s.gridJobs)}`);
      const cooked_s = (s.now_ms - (cook?.startedAt_s ?? 0) * 1000) / 1000;
      return `${(cooked_s / 60).toFixed(1)} min of cook in ${((Date.now() - real0) / 1000).toFixed(1)} s; `
        + `recommended ${rec.recommended_s.toFixed(1)} s, pan ${JSON.stringify(pans)}`;
    },
  },

  'running-lines': {
    what: 'corrected to cold and left heating, the slow hob counts the time heated up; a correction the white never sets in says so',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      const start_s = s.cook?.startedAt_s ?? 0;
      await tab.shift(300);
      await tab.click('#startCold');
      s = await corrected(tab, null);
      check(s.phase === 'HEATING' && !s.lengthened, `Heating on the guess: ${s.phase}, ${s.lengthened}`);
      await tab.shiftTo(start_s + 16 * 60);
      await tab.settle();
      s = await tab.phase('HEATING');
      check(s.lengthened, 'the slow hob lengthened');
      check(s.digits === '16:00', `the time heated, counting up: ${s.digits}`);
      const slow = `${s.digits}, "${s.subline}"`;
      await tab.click('#secondary');
      await tab.phase('IDLE');
      // A boiling start with the heat off in a little water, one small egg:
      // corrected to it mid-cook, the white never sets, and the slot says so.
      await tab.click('#startHot');
      s = await start(tab, 'hot');
      await later(tab);
      await tab.click('#heatOff');
      s = await corrected(tab, null);
      await later(tab);
      await pick(tab, '#size', '0');
      s = await corrected(tab, s);
      await later(tab);
      await tab.eval(`(() => { const e = ${byId('eggCount')}; e.value = '1';
        e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      s = await corrected(tab, s);
      await later(tab);
      await tab.eval(`(() => { const e = ${byId('litres')}; e.value = '0.5';
        e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      s = await corrected(tab, s);
      await tab.settle();
      const warn = await tab.eval<{ hidden: boolean; text: string }>(
        `(() => { const w = ${byId('warn')}; return { hidden: w.hidden, text: w.textContent }; })()`);
      const never = await tab.words('refusal.whiteNeverSets');
      check(!warn.hidden && warn.text === never, `the slot: "${warn.text}"`);
      return `${slow}; heat off, 0.5 L, one small egg: "${warn.text}"`;
    },
  },

  'hot-start': {
    what: 'a hot start: in, the pull, out, the cooling, Done, Start again logs the unanswered egg',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      labelSays(s);
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      const d = deadlines(s);
      check(!s.deadlines?.provisional, 'a hot start knows its pull');
      await tab.shiftTo(d.cookEnd_s + 2);
      s = await tab.phase('PULL');
      await tab.click('#primary');
      s = await tab.phase('COOLING');
      const d2 = deadlines(s);
      await tab.shiftTo(d2.coolEnd_s + 1);
      s = await tab.phase('DONE');
      const cook = storedCook(s);
      await tab.click('#primary');
      await tab.until('__snap().log.length === 1', 'the unanswered egg logged');
      s = await tab.phase('IDLE');
      const rec = s.log[0];
      check(rec.id === cook?.id_ms && rec.yolkWord === null && rec.forecast !== null,
        `unanswered, with its forecast: ${JSON.stringify({ id: rec.id, yolk: rec.yolkWord, f: rec.forecast !== null })}`);
      check(s.stored === null, 'the cook forgotten');
      return `pull at +${(d.cookEnd_s - (cook?.startedAt_s ?? 0)).toFixed(1)} s, logged unanswered with its forecast`;
    },
  },

  bowl: {
    what: 'a bowl of water: chosen, its water, the count and the temperature set; the sentence, the plan, the pull, the cooling and the record',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      await tab.click('#startHot');
      await tab.until("__snap().settings.startMode === 'hot' && __snap().chosen !== null", 'a hot start decided');
      const minutes = (digits: string): number => {
        const [m, sec] = digits.split(':').map(Number);
        return 60 * m + sec;
      };
      const ice = minutes((await tab.snap()).digits);
      // The bowl and its numbers, each as typed into its field.
      const type = async (id: ElementId, value: string, settled: string): Promise<void> => {
        await tab.eval(`(() => { const e = ${byId(id)};
          e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        await tab.until(settled, `${id} at ${value}`);
      };
      await tab.click('#sentence .clause[aria-controls="panelCooling"]');
      await tab.click('#coolBowl');
      await tab.until("__snap().settings.cooling === 'bowl'", 'the bowl chosen');
      const shown = await tab.eval<{ bowl: boolean; water: boolean; placeholder: string }>(`(() => ({
        bowl: !${byId('bowlFields')}.hidden, water: !${byId('coolingWaterField')}.hidden,
        placeholder: ${byId('coolingWater')}.placeholder }))()`);
      check(shown.bowl && shown.water && shown.placeholder === '20',
        `the bowl's rows, its temperature greyed at the room: ${JSON.stringify(shown)}`);
      await type('bowlLitres', '1', '__snap().settings.bowlLitres === 1');
      await type('eggCount', '4', '__snap().settings.eggCount === 4');
      await type('coolingWater', '12', '__snap().settings.bowlWater_C === 12');
      await tab.settle();
      await tab.until('__snap().chosen !== null', 'the bowl decided');
      let s = await tab.snap();
      const { sentence } = await sentenceSays(tab);
      check(sentence.startsWith('4 × 68 g eggs') && sentence.includes('then into a bowl with 1 L of water at 12 °C.'),
        `the sentence: ${sentence}`);
      const bowl = minutes(s.digits);
      check(bowl < ice && ice - bowl < 60, `the bowl cooks shorter than ice, by seconds: ${bowl} s against ${ice} s`);
      // In, out at the pull, into the bowl.
      await tab.click('#primary');
      await tab.phase('COOKING');
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      const ch = s.cook?.choices as unknown as Record<string, unknown>;
      check(ch['cooling'] === 'bowl' && ch['bowlLitres'] === 1 && ch['bowlWater_C'] === 12 && ch['eggCount'] === 4,
        `the cook's own bowl: ${JSON.stringify(ch)}`);
      const d = deadlines(s);
      await tab.shiftTo(d.cookEnd_s + 2);
      s = await tab.phase('PULL');
      check(s.primary === 'In the bowl of water', `the pull: ${s.primary}`);
      await tab.click('#primary');
      s = await tab.phase('COOLING');
      check(s.label === 'Leave them in the bowl', `the cooling: ${s.label}`);
      const d2 = deadlines(s);
      const counted = d2.coolEnd_s - (storedCook(s)?.events.pulled?.out_s ?? NaN);
      check(counted > 120 && counted < 600, `the cooling counted to the yolk's peak in the bowl: ${counted.toFixed(0)} s`);
      await tab.shiftTo(d2.coolEnd_s + 1);
      await tab.phase('DONE');
      await tab.click('#primary');
      await tab.until('__snap().log.length === 1', 'the egg logged');
      s = await tab.snap();
      const setup = (s.log[0] as unknown as { setup: Record<string, unknown> }).setup;
      check(setup['cooling'] === 'bowl' && setup['bowlLitres'] === 1 && setup['coolingWater_C'] === 12 && setup['eggCount'] === 4,
        `the record's bowl: ${JSON.stringify(setup)}`);
      return `ice ${ice} s, the bowl ${bowl} s; cooling counted ${counted.toFixed(0)} s; recorded in 1 L at 12 °C`;
    },
  },

  cancel: {
    what: 'Cancel while heating and while cooking: nothing logged, the cook gone, the boil remembered',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'cold');
      await tab.click('#secondary');
      s = await tab.phase('IDLE');
      check(s.stored === null && s.log.length === 0, 'Cancel while heating: nothing kept');
      check((await tab.storage(BOIL_KEY)) === null, 'no boil to remember');
      s = await start(tab, 'cold');
      await tab.shift(300);
      s = await boil(tab);
      await tab.click('#secondary');
      s = await tab.phase('IDLE');
      check(s.stored === null && s.log.length === 0, 'Cancel while cooking: nothing logged');
      const pans = pansIn(await tab.storage(BOIL_KEY));
      check(Object.values(pans).some((v) => near(v, 300, 1e-6)), `the boil remembered at Cancel: ${JSON.stringify(pans)}`);
      return `pans ${JSON.stringify(pans)}`;
    },
  },

  reload: {
    what: 'a reload at Heating, Cooking, Pull, Cooling and Done: the same deadlines, nothing lost',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      await start(tab, 'cold');
      const notes: string[] = [];
      const again = async (where: string): Promise<Snap> => {
        await tab.until('__snap().decided || __snap().deadlines.provisional',
          'the plan before');
        const before = await tab.snap();
        await tab.reload();
        await tab.until('__snap().decided || __snap().deadlines.provisional',
          'the plan after');
        const after = await tab.snap();
        check(after.phase === before.phase, `${where}: ${before.phase} became ${after.phase}`);
        const a = deadlines(before);
        const b = deadlines(after);
        check(near(a.cookEnd_s, b.cookEnd_s, 1e-6) && (Number.isNaN(a.coolEnd_s) || near(a.coolEnd_s, b.coolEnd_s, 1e-6)),
          `${where}: deadlines ${JSON.stringify(a)} became ${JSON.stringify(b)}`);
        const ca = storedCook(before);
        const cb = storedCook(after);
        check(JSON.stringify(ca?.events) === JSON.stringify(cb?.events), `${where}: events ${JSON.stringify(ca?.events)} became ${JSON.stringify(cb?.events)}`);
        check(after.log.length === before.log.length, `${where}: the log`);
        labelSays(after);
        notes.push(`${where} ${after.digits}`);
        return after;
      };
      await tab.shift(200);
      await again('Heating');
      await tab.shift(100);
      let s = await boil(tab);
      await tab.shift(60);
      s = await again('Cooking');
      await tab.shiftTo(deadlines(s).cookEnd_s + 3);
      s = await tab.phase('PULL');
      s = await again('Pull');
      await tab.click('#primary');
      s = await tab.phase('COOLING');
      await tab.shift(30);
      s = await again('Cooling');
      await tab.shiftTo(deadlines(s).coolEnd_s + 2);
      s = await tab.phase('DONE');
      s = await again('Done');
      check(storedCook(s)?.events.pulled?.by === 'cook', 'the tap out kept across the reloads');
      return notes.join(', ');
    },
  },

  'woken-past-pull': {
    what: 'a tab woken 25 s past the pull rings it; one woken past the cooling rings the pull, not Done',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      await start(tab, 'cold');
      await tab.shift(470);
      let s = await boil(tab);
      const d = deadlines(s);
      let osc = await tab.osc();
      const ahead = osc.filter(scheduledAhead);
      check(ahead.length === 1, `the pull's ring scheduled ahead at the tap, ${ahead.length}`);
      const pullRing = ahead[0].mark;
      const lead = (ahead[0].at ?? 0) - ahead[0].made;
      check(near(lead, d.cookEnd_s - ahead[0].page / 1000, 0.05), `the pull's ring ${lead.toFixed(1)} s ahead`);
      // Woken 25 s past the pull, as a throttled or frozen tab is.
      let base = osc.length;
      await tab.shiftTo(d.cookEnd_s + 25);
      s = await tab.phase('COOLING');
      await tab.settle();
      osc = await tab.osc();
      const now = rings(osc.slice(base));
      check(now.length === 1 && (now[0].at ?? 0) - now[0].made < 0.1, `rung at once, ${now.length}`);
      const ev = storedCook(s)?.events;
      check(ev?.rangAt_s !== null && ev?.pulled?.by === 'timeout', `the pull rung and timed out: ${JSON.stringify(ev)}`);
      base = osc.length;
      await tab.shiftTo(deadlines(s).coolEnd_s + 1);
      s = await tab.phase('DONE');
      await tab.settle();
      const done = rings((await tab.osc()).slice(base));
      check(done.length === 1 && done[0].mark !== pullRing, `Done's ring, not the pull's: ${done.length}`);
      // A second cook, woken straight past the cooling: the pull rings, not Done.
      await tab.click('#primary');
      await tab.phase('IDLE');
      await start(tab, 'cold');
      await tab.shift(470);
      s = await boil(tab);
      base = (await tab.osc()).length;
      await tab.shiftTo(deadlines(s).coolEnd_s + 600);
      s = await tab.phase('DONE');
      await tab.settle();
      const rung = rings((await tab.osc()).slice(base));
      check(rung.length === 1 && rung[0].mark === pullRing, `past the cooling: the pull's ring, not Done's: ${rung.length}`);
      return 'tap: a ring ahead; +25 s: rung at once, Cooling; Done: its own ring; straight to Done: the pull\'s';
    },
  },

  'too-old': {
    what: 'a cold start never tapped is ended at two hours, in the tab that runs it',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'cold');
      const start_s = s.cook?.startedAt_s ?? 0;
      await tab.shiftTo(start_s + 7100);
      s = await tab.phase('HEATING');
      check(s.lengthened, 'the slow hob lengthened');
      const at7100 = s.digits;
      await tab.shiftTo(start_s + 7210);
      s = await tab.phase('IDLE');
      check(s.stored === null && s.log.length === 0, 'ended, nothing stored, nothing logged');
      return `Heating at 7,100 s (${at7100}), idle at 7,210 s`;
    },
  },

  'done-wakes': {
    what: 'a page left at Done, never looked at again, ends its cook an hour past the end and logs the egg',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'hot');
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      await tab.shiftTo(deadlines(s).cookEnd_s + 25);
      s = await tab.phase('COOLING');
      await tab.shiftTo(deadlines(s).coolEnd_s - 2);
      // An hour of the cook in a second of the page's, from here on, with no
      // look: the tick takes it to Done and stops, and the page wakes itself
      // when the plan says the cook is too old.
      await tab.eval('window.aetClock.speed(3600)');
      await tab.until("__snap().phase === 'IDLE'", 'ended by the wake');
      s = await tab.snap();
      check(s.stored === null && s.log.length === 1 && s.log[0].yolkWord === null,
        `forgotten, the egg logged unanswered: ${s.stored === null}, ${s.log.length}`);
      return 'Done, then idle an hour on with no look; the egg logged unanswered';
    },
  },

  'slow-hob': {
    what: 'a slow hob: past the guess, the clock counts the time heated up, still Heating',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      let s = await start(tab, 'cold');
      const start_s = s.cook?.startedAt_s ?? 0;
      await tab.shiftTo(start_s + 16 * 60);
      await tab.settle();
      s = await tab.phase('HEATING');
      check(s.lengthened, 'the plan lengthened');
      const first = s.digits;
      check(first === '16:00', `the time heated, ${first}`);
      await tab.shift(65);
      await tab.settle();
      s = await tab.snap();
      check(s.phase === 'HEATING' && s.digits === '17:05', `counting up: ${s.digits}`);
      return `${first}, then ${s.digits}; "${s.subline}"`;
    },
  },

  'egg-cup': {
    what: 'eaten warm from an egg cup: soft offered where the air snaps it, the sentence and the pull say the egg cup, Done at the pull with nothing counted, and the record',
    run: async (h) => {
      const tab = await h.ctx.open(STOPPED);
      await tab.click('#startHot');
      await tab.until("__snap().settings.startMode === 'hot'", 'a hot start chosen');
      const soft = 0.22;
      const decidedAt = async (cooling: string, what: string): Promise<number> => {
        await tab.click(cooling === 'eggCup' ? '#coolEggCup' : '#coolCounter');
        await setSlider(tab, soft);
        await tab.until(`__snap().settings.cooling === '${cooling}' && __snap().chosen !== null`, what);
        await tab.settle();
        return (await tab.snap()).chosen?.level ?? NaN;
      };
      // In the air soft is striped out and the slider snaps past it.
      const inAir = await decidedAt('counter', 'the air chosen');
      check(inAir > 0.4, `in the air, soft snapped to ${inAir}`);
      const inCup = await decidedAt('eggCup', 'the egg cup chosen');
      check(near(inCup, soft, 1e-9), `in an egg cup, soft offered: ${inCup}`);
      const warn = await tab.eval<{ hidden: boolean; text: string }>(
        `(() => { const w = ${byId('warn')}; return { hidden: w.hidden, text: w.textContent }; })()`);
      check(warn.hidden, `nothing refused: "${warn.text}"`);
      const said = await sentenceSays(tab);
      const clause = EN['setup.cooling.eggCup'].text;
      check(said.sentence.includes(clause), `the sentence says "${clause}": "${said.sentence}"`);
      await tab.click('#primary');
      let s = await tab.phase('COOKING');
      await tab.until('__snap().decided', 'the pot planned');
      s = await tab.snap();
      check(s.cook?.choices.cooling === 'eggCup' && near(s.cook.choices.level, soft, 1e-9),
        `the cook: ${s.cook?.choices.cooling} at ${s.cook?.choices.level}`);
      check(s.deadlines?.coolEnd_s === null, `nothing counted after the pull: ${s.deadlines?.coolEnd_s}`);
      await tab.shiftTo(deadlines(s).cookEnd_s + 2);
      s = await tab.phase('PULL');
      const pull = EN['action.pulled.eggCup'].text;
      check(s.primary === pull, `the pull says "${pull}": "${s.primary}"`);
      await tab.click('#primary');
      s = await tab.phase('DONE');
      check(s.feedback, 'the questions at Done, at the pull');
      check(storedCook(s)?.events.cooledAt_s === null, 'no cooling written');
      await tab.click('.fb[data-yolk="soft"]');
      await tab.until('__snap().log.length === 1', 'the egg logged');
      const rec = (await tab.snap()).log[0] as Rec & { cooled_s: number; setup: { cooling: string } };
      check(rec.setup.cooling === 'eggCup' && rec.cooled_s === 0 && rec.yolkWord === 'soft',
        `the record: ${rec.setup.cooling}, cooled ${rec.cooled_s}, ${rec.yolkWord}`);
      return `soft in the air snapped to ${inAir.toFixed(2)}, in an egg cup ${inCup}; "${said.sentence}"; `
        + `recommended ${rec.recommended_s.toFixed(1)} s`;
    },
  },
};
