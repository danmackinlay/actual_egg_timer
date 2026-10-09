/**
 * fixtures/policy.json: the decisions above the physics - snapping, the
 * refusal verdict, texture bands, the calibration grid's geometry, the bounds
 * and defaults, both size-class tables, the phase rule, and what a sender
 * makes of the sharing endpoint's answer.
 */

import { SIZE_CLASSES, US_SIZE_CLASSES, SizeClass, sizeTableFor } from '../../src/core/geometry.js';
import { DONENESS_ANCHORS, Solution } from '../../src/core/solve.js';
import {
  LIMITS, SLIDER_STEPS, PARTICLE_COUNT as POLICY_PARTICLES, CALIBRATION_SEED, DEFAULTS, DEFAULT_EGG_MASS_KG,
  DEFAULT_TIME_TO_BOIL_S, START_TEMP_PRESETS_C, BoilMemory, CALIBRATION_ALPHA_HIGH, CALIBRATION_ALPHA_LOW,
  COOLING_SECONDS, PULL_GRACE_SECONDS, ROOM_EGG_FROM_C, SLOW_HOB_EVERY_S, SLOW_HOB_EXTRA_S,
  SLOW_HOB_WHEN_LEFT_S, SHARE_WAIT_S, SHARE_WAIT_TRIES, WHITE_BAND_BELOW_C, YOLK_BAND_BELOW_C, ambientFor,
  anchorNear, anchorReachable, calibrationGrid,
  carrySizeIndex, estimateTimeToBoil, phaseAt, rememberBoil, snapDown, snapUp, targetPeakYolk_C, textureFor,
  textureNoteKeys, verdictFor, roomInUse, shareGivesUp, shareReply, startTempPreset_C,
  ALARM_RING_S, ALARM_SOUNDS, AlarmMoment, DEFAULT_ALARM_SOUND, NOTIFICATION_SOUND_MAX_S, alarmPeriod_s,
  alarmRepeats, notificationRepeats, readAlarmSound,
} from '../../src/core/policy.js';

/* The decisions above the physics. None of it is expensive, so the cases
 * are dense rather than representative: an off-by-one in a port's loop or a
 * flipped comparison should have nowhere to hide.
 *
 * The verdict cases are built from SYNTHETIC Solutions rather than from solved
 * cooks. That is deliberate - the point is to pin the decision, not to re-test
 * the solver, and a synthetic solution can sit exactly on the boundaries that
 * a real one reaches only by accident. */

const SNAP_LEVELS: number[] = [];
for (let i = 0; i <= 40; i++) SNAP_LEVELS.push(i / 40);
for (const awkward of [0.41, 0.2199999, 0.615, 0.0001, 0.9999, 0.11, 1 / 3]) {
  SNAP_LEVELS.push(awkward);
}

/** A Solution with only the fields the verdict reads. */
function verdictCase(
  reachable: boolean, whiteSets: boolean, softestLevel: number, hardestLevel: number,
): Solution {
  return {
    result: {
      cookTime_s: 0, peakYolk_C: 0, peakYolkTime_s: 0, yolkAtPull_C: 0,
      yolkDose_min: 0, whiteDose_min: 0, peakWhite_C: 0,
    },
    reachable: reachable,
    minCookTime_s: 0,
    softestLevel: softestLevel,
    hardestLevel: hardestLevel,
    whiteSets: whiteSets,
  };
}

const VERDICT_CASES: { reachable: boolean; whiteSets: boolean; softest: number; hardest: number; level: number }[] = [];
for (const level of [0.0, 0.22, 0.41, 0.5, 0.62, 0.9, 1.0]) {
  VERDICT_CASES.push({ reachable: true, whiteSets: true, softest: 0, hardest: 1, level: level });
  VERDICT_CASES.push({ reachable: false, whiteSets: false, softest: 1, hardest: 0, level: level });
  for (const softest of [0.0, 0.415, 0.608, 0.73]) {
    VERDICT_CASES.push({ reachable: false, whiteSets: true, softest: softest, hardest: 1, level: level });
  }
  for (const hardest of [0.735, 0.42, 0.405]) {
    VERDICT_CASES.push({ reachable: false, whiteSets: true, softest: 0, hardest: hardest, level: level });
  }
}

/* Every boundary with the white setting, and a few without: a white the pan
 * never sets is runny whatever its peak, even one hot enough to read "firm". */
const TEXTURE_CASES: [number, number, boolean][] = [];
for (const yolk of [50, 57.9, 58, 62.9, 63, 67.9, 68, 72.9, 73, 85]) {
  for (const white of [60, 70.9, 71, 81.9, 82, 95]) TEXTURE_CASES.push([yolk, white, true]);
}
for (const [yolk, white] of [[50, 60], [57.9, 70.9], [65, 71], [73, 95]]) {
  TEXTURE_CASES.push([yolk, white, false]);
}

/* Two pans remembered in both orders, so a port that iterates an unordered map
 * is caught rather than merely lucky. */
const BOIL_MEMORY_FORWARD: BoilMemory = rememberBoil(rememberBoil({}, 1, 300), 3, 900);
const BOIL_MEMORY_BACKWARD: BoilMemory = rememberBoil(rememberBoil({}, 3, 900), 1, 300);
const BOIL_QUERY_LITRES = [0.5, 1, 1.5, 2, 2.5, 3, 4, 12];

/** A size class as the fixture states it: the key and the mass the model
 *  cooks. What its label shows, in either system, is in units.json. */
function sizeClassRow(c: SizeClass): { key: string; mass_kg: number } {
  return { key: c.key, mass_kg: c.mass_kg };
}

export const policyFixture = {
  about: 'The decisions above the physics: snapping, the refusal verdict, texture bands, the calibration grid\'s geometry, the bounds and defaults, both size-class tables, the phase rule, a sharing sender\'s reading of the endpoint\'s answer. src/core/policy.ts.',
  slider: {
    steps: SLIDER_STEPS,
    cases: SNAP_LEVELS.map((level) => ({
      level: level,
      snapUp: snapUp(level),
      snapDown: snapDown(level),
      anchor: anchorNear(level).key,
      targetPeakYolk_C: targetPeakYolk_C(level),
    })),
  },
  /* Which tick words can be reached between a softest and a hardest level:
   * the soft end after a runny white (a floor at 0.05-0.09, still Runny), each
   * word's edges - 0.11 is Runny's last position and 0.12 Soft's first, 0.80
   * Fudgy's last and 0.81 Hard's first - and
   * a pan whose white never sets (softest 1, hardest 0). */
  reachableWords: [
    [0, 1], [0.05, 1], [0.09, 1], [0.11, 1], [0.1100001, 1], [0.12, 1], [0.3, 1], [0.315, 1], [0.32, 1],
    [0.52, 1], [0.8, 1], [0.81, 1], [0.82, 1], [1, 1], [0, 0.82], [0, 0.81], [0, 0.8], [0, 0.515],
    [0.42, 0.5], [0.2, 0.25], [1, 0],
  ].map(([softest, hardest]) => ({
    softest: softest,
    hardest: hardest,
    reachable: DONENESS_ANCHORS.map((_, i) => anchorReachable(i, softest, hardest)),
  })),
  verdict: VERDICT_CASES.map((c) => {
    const v = verdictFor(verdictCase(c.reachable, c.whiteSets, c.softest, c.hardest), c.level);
    return {
      reachable: c.reachable,
      whiteSets: c.whiteSets,
      softestLevel: c.softest,
      hardestLevel: c.hardest,
      level: c.level,
      kind: v.kind,
      wanted: v.wanted.key,
      limit: v.limit.key,
      snapTo: v.snapTo === null ? null : v.snapTo,
      worthSaying: v.worthSaying,
    };
  }),
  // The texture bands' edges, the room egg's and the calibration grid's
  // alpha factors, by name; the cases below pin how each is used.
  edges: {
    whiteBandBelow_C: WHITE_BAND_BELOW_C,
    yolkBandBelow_C: YOLK_BAND_BELOW_C,
    roomEggFrom_C: ROOM_EGG_FROM_C,
    calibrationAlphaLow: CALIBRATION_ALPHA_LOW,
    calibrationAlphaHigh: CALIBRATION_ALPHA_HIGH,
  },
  texture: TEXTURE_CASES.map(([yolk, white, whiteSets]) => {
    const t = textureFor(yolk, white, whiteSets);
    const note = textureNoteKeys(t);
    return {
      peakYolk_C: yolk, peakWhite_C: white, whiteSets: whiteSets, white: t.white, yolk: t.yolk,
      noteKey: note.key, noteWhite: note.parts['white'] ?? null, noteYolk: note.parts['yolk'] ?? null,
    };
  }),
  calibrationGrid: [
    { alphaCentre: 1.4e-7, cookTime_s: 441 },
    { alphaCentre: 1.4e-7, cookTime_s: 60 },
    { alphaCentre: 1.4e-7, cookTime_s: 120 },
    { alphaCentre: 2.0e-7, cookTime_s: 800 },
  ].map((c) => {
    const g = calibrationGrid(c.alphaCentre, c.cookTime_s);
    return {
      alphaCentre: c.alphaCentre,
      cookTime_s: c.cookTime_s,
      alphaMin: g.alphaMin,
      alphaMax: g.alphaMax,
      alphaCount: g.alphaCount,
      timeMin_s: g.timeMin_s,
      timeMax_s: g.timeMax_s,
      timeCount: g.timeCount,
    };
  }),
  boilMemory: {
    blend: [
      { previous: null, measured: 480, result: estimateTimeToBoil(rememberBoil({}, 2, 480), 2) },
      {
        previous: 480, measured: 600,
        result: estimateTimeToBoil(rememberBoil(rememberBoil({}, 2, 480), 2, 600), 2),
      },
    ],
    refused: [3, 99999].map((seconds) => ({
      seconds: seconds,
      remembered: Object.keys(rememberBoil({}, 2, seconds)).length > 0,
    })),
    estimate: BOIL_QUERY_LITRES.map((litres) => ({
      litres: litres,
      forward: estimateTimeToBoil(BOIL_MEMORY_FORWARD, litres),
      backward: estimateTimeToBoil(BOIL_MEMORY_BACKWARD, litres),
    })),
    defaultSeconds: DEFAULT_TIME_TO_BOIL_S,
  },
  defaults: {
    ...DEFAULTS,
    eggMass_kg: DEFAULT_EGG_MASS_KG,
    fridge_C: START_TEMP_PRESETS_C.fridge,
    room_C: START_TEMP_PRESETS_C.room,
  },
  /* Both tables whole, which region gets which, and what a stored index
   * becomes under each. The regions include the near misses a port might
   * accept - lower case is the same region, `USA` is not a region code at all,
   * and null is a language tag that names no region. The carry cases straddle
   * every edge: below -1, the -0.5 tie that the two languages round in
   * opposite directions, halves, and past the end of both tables. */
  sizeClasses: {
    eu: SIZE_CLASSES.map(sizeClassRow),
    us: US_SIZE_CLASSES.map(sizeClassRow),
    regions: ['US', 'us', 'GB', 'CZ', 'CA', 'USA', '', null].map((region) => ({
      region: region,
      table: sizeTableFor(region),
    })),
    carry: [-3, -1, -0.5, -0.4, 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 7].map((stored) => ({
      stored: stored,
      eu: carrySizeIndex(stored, SIZE_CLASSES),
      us: carrySizeIndex(stored, US_SIZE_CLASSES),
    })),
  },
  // The room assumed from the egg, and the room as measured, which wins.
  ambient: [null, 12, 27].flatMap((room_C) => [0, 4, 14.9, 15, 20, 26].map((eggStart_C) => ({
    eggStart_C: eggStart_C,
    room_C: room_C,
    ambient_C: ambientFor(eggStart_C, room_C),
  }))),
  // The measured room counts only with a probe, clamped; and it moves the
  // Room button, never the Fridge.
  roomInUse: [true, false].flatMap((probe) => [null, 2, 5, 23.5, 40, 41].map((room_C) => ({
    probe: probe,
    room_C: room_C,
    inUse_C: roomInUse(probe, room_C),
  }))),
  startTempPresets: (['fridge', 'room'] as const).flatMap((preset) => [null, 12, 27].map((room_C) => ({
    preset: preset,
    room_C: room_C,
    eggStart_C: startTempPreset_C(preset, room_C),
  }))),
  limits: LIMITS,
  calibration: { particles: POLICY_PARTICLES, seed: CALIBRATION_SEED },
  /* What a sender makes of the endpoint's answer, and when it stops waiting:
   * every status class's edges, and both bounds either side. */
  share: {
    waitTries: SHARE_WAIT_TRIES,
    wait_s: SHARE_WAIT_S,
    replies: [100, 199, 200, 201, 202, 204, 299, 301, 304, 399, 400, 401, 402, 403, 404, 405, 407, 408, 409, 413,
      415, 422, 428, 429, 430, 451, 499, 500, 502, 503, 504, 511, 599, 600].map((status) => ({
      status: status,
      reply: shareReply(status),
    })),
    givesUp: [0, 1, 4, 5, 6, 50].flatMap((tries) => [
      -1, 0, 3600, SHARE_WAIT_S - 1, SHARE_WAIT_S, SHARE_WAIT_S + 1, 30 * 24 * 3600,
    ].map((waited_s) => ({ tries: tries, waited_s: waited_s, givesUp: shareGivesUp(tries, waited_s) }))),
  },
  /* The alarm sounds: the picker's order, the default, what a stored value
   * reads as (a near miss in case, a retired sound, not a string, absent),
   * and each sound's timing at both moments. */
  alarm: {
    sounds: ALARM_SOUNDS,
    default: DEFAULT_ALARM_SOUND,
    ring_s: ALARM_RING_S,
    notificationMax_s: NOTIFICATION_SOUND_MAX_S,
    read: ['timer', 'cuckoo', 'hen', 'Hen', 'beeps', '', 3, true, null].map((stored) => ({
      stored: stored,
      sound: readAlarmSound(stored),
    })),
    timing: ALARM_SOUNDS.flatMap((sound) => (['pull', 'cooled'] as AlarmMoment[]).map((moment) => ({
      sound: sound,
      moment: moment,
      period_s: alarmPeriod_s(sound, moment),
      repeats: alarmRepeats(sound, moment),
      notificationRepeats: notificationRepeats(sound, moment),
    }))),
  },
  phase: {
    coolingSeconds: COOLING_SECONDS,
    pullGraceSeconds: PULL_GRACE_SECONDS,
    slowHob: { whenLeft_s: SLOW_HOB_WHEN_LEFT_S, extra_s: SLOW_HOB_EXTRA_S, every_s: SLOW_HOB_EVERY_S },
    /* Two timelines from the same cook, differing only in whether there is a
     * cooling step to time. The counter one matters most: with no cooling
     * deadline, a port could fall from COOKING straight to DONE and never show
     * the pull at all. Sampled either side of every boundary. */
    timelines: [
      { name: 'ice bath', cookEnd_s: 600, coolEnd_s: 600 + PULL_GRACE_SECONDS + COOLING_SECONDS, outAt_s: null },
      { name: 'counter rest', cookEnd_s: 600, coolEnd_s: null, outAt_s: null },
      // The cook tapped the eggs out 5 s into the grace: the cooling is timed
      // from the tap.
      { name: 'ice bath, out at the tap', cookEnd_s: 600, coolEnd_s: 605 + COOLING_SECONDS, outAt_s: 605 },
      { name: 'counter rest, out at the tap', cookEnd_s: 600, coolEnd_s: null, outAt_s: 605 },
    ].map((t) => ({
      name: t.name,
      cookEnd_s: t.cookEnd_s,
      coolEnd_s: t.coolEnd_s,
      outAt_s: t.outAt_s,
      samples: [
        0, 1, 599, 599.999, 600, 600.001, 604.999, 605, 605.001, 619, 619.999, 620, 620.001,
        700, 784.999, 785, 799, 799.999, 800, 800.001, 10000,
      ].map((now_s) => ({
        now_s: now_s,
        provisional: phaseAt(
          { cookEnd_s: t.cookEnd_s, coolEnd_s: t.coolEnd_s, provisional: true, outAt_s: t.outAt_s }, now_s,
        ),
        phase: phaseAt(
          { cookEnd_s: t.cookEnd_s, coolEnd_s: t.coolEnd_s, provisional: false, outAt_s: t.outAt_s }, now_s,
        ),
        // A question open about a pull the clock assumed: never Done.
        asking: phaseAt(
          { cookEnd_s: t.cookEnd_s, coolEnd_s: t.coolEnd_s, provisional: false, outAt_s: t.outAt_s, asking: true },
          now_s,
        ),
      })),
    })),
  },
};
