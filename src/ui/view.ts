/**
 * What the egg page shows, as plain data (`view(model, now)`): one layout
 * in every phase (design/one-screen.md section 2) - the readout, how sure I
 * am, the slider with its shading and bracket, the sentence with the egg in
 * cross-section beside it, the slot and the buttons. While idle they are the
 * controls' answer, with the advice and the welcome; while a cook runs, its
 * plan's, from its own choices; in sous-vide, the bath's.
 *
 * Pure: it reads the model and the moment it is given, and the words of the
 * catalogue and the units on screen, and writes nothing; the egg previews it
 * draws (a solve's worth of steps each) are kept in `ViewMemo`, handed in,
 * so each is worked out once. Drawing it is render.ts's.
 */

import { CertaintyReading, WordCertainty } from '../core/certainty.js';
import { midSentence } from '../core/copy.js';
import { Egg } from '../core/geometry.js';
import { anchorNear, targetPeakYolk_C } from '../core/slider.js';
import { textureFor, textureNoteKeys } from '../core/texture.js';
import { CookSetup } from '../core/protocol.js';
import type { Outcome } from '../core/outcome.js';
import { OddsProfile } from '../core/reach.js';
import { CookPlan, Phase, RunningCook, asRanShown, asksIfStillIn, solutionAsRan } from '../core/running.js';
import { SectionView, previewSection, sectionView } from '../core/section.js';
import { ModelParams, Solution } from '../core/solve.js';
import { SOUS_VIDE_BATH_C, sousVideEstimate } from '../core/sousvide.js';
import { nudgeFrom } from '../core/units.js';
import {
  WordsRef, certaintyKey, forecastWhiteAtRisk, intervalWords, mostLikelyOpened, mostLikelyShown, mostLikelyWords,
  refusalKey, timeRangeWords, whiteAtRisk,
} from '../core/wording.js';
import { adviceFor } from './answer.js';
import { calibrationDoneness, calibrationParams } from './calibration.js';
import { activeLocale, t, timeOfDay } from './copy.js';
import { formatClock } from './countdown.js';
import { CookShown, answeredHere, cookShown, pickedUpAfterReload, probePending, probeWanted } from './feedback.js';
import type { Learning } from './learned.js';
import type { Model } from './model.js';
import { PhaseView, phaseView } from './phaseView.js';
import { SetupFacts, liveSetupFacts } from './sentence.js';
import { sousVideCopy } from './sousvide.js';
import {
  boilingPoint_C, currentEgg, idlePot, isSousVide, learning, phaseNow, sizeClasses, startModeNow,
} from './state.js';
import { UiStartMode, estimateTimeToBoil, hasBoilMemory } from './store.js';
import { measure, show } from './units.js';
import { warningText } from './warning.js';

/** The slider's reading: a level and the peak yolk it asks for, or the
 *  bath's temperature in sous-vide (slider.ts, `renderDonenessReading`). */
export type ReadingView = { level: number; peakYolk_C: number } | { level: number; bath_C: number };

/** The track under the slider: its stripes from a solve, its shading from
 *  the odds and its bracket from the certainty's words (slider.ts,
 *  `renderDonenessScale`); or bare, in sous-vide. */
export type ScaleView = { solution: Solution; odds: OddsProfile | null; bracket: WordCertainty | null } | 'bare';

/** The readout, the buttons under it and the questions at Done. */
export interface ReadoutView {
  phase: Phase;
  start: UiStartMode;
  /** The warning line; hidden when empty. */
  warning: string;
  words: PhaseView;
  /** The questions after the egg, and what is said over them: what has
   *  been learned (null: as drawn, an answer given here), the egg the yolk
   *  is graded against (null: as drawn, the questions hidden), and the
   *  probe's field, its suggestion from the peak (null: as drawn). */
  feedback: boolean;
  notes: Learning | null;
  target: string | null;
  probe: { shown: boolean; placeholder: string | null };
  /** The (i) beside the full rolling boil. */
  hintInfo: boolean;
  /** The live region's announcement, and what it is of (the phase and the
   *  minute), so it is said once. */
  announce: { key: string; text: string };
}

/** How sure I am, under the time: the class as a line that opens in place
 *  to the 90% interval, the most likely word and the likely time range; null
 *  when there is nothing to say. */
export interface CertaintyView {
  word: string;
  /** "Most likely", under the line unpressed, or in what it opens. */
  likely: string;
  under: boolean;
  opened: boolean;
  interval: string;
  time: string;
}

/** The egg in cross-section: what to paint, as which reading, and what it is
 *  of (painted again only when that changes; a live egg every time). */
export interface SectionDraw {
  view: SectionView;
  reading: 'aim' | 'live' | 'ran';
  key: string;
}

/** The parts of the page shared by every screen with a time on it. */
interface Screen {
  learning: boolean;
  sentence: SetupFacts;
  /** When the eggs went in, in the start's panel; null while idle. */
  startedAt: string | null;
  statBoil: string;
  note: string;
  reading: ReadingView;
  scale: ScaleView;
  readout: ReadoutView;
  /** The (i) on "Based on history". */
  sublineInfo: boolean;
  certainty: CertaintyView | null;
  whiteRisk: boolean;
  /** The readout's height: let go, held at what it last measured while the
   *  lines are blank (a new pot's surface on its way), or measured. */
  height: 'free' | 'hold' | 'measure';
  advice: { link: boolean; keys: string[] };
  welcome: boolean;
  /** Null: the drawing as it is. */
  section: SectionDraw | null;
}

/** What the page shows. */
/** On every screen: the mute, and the line that says a newer build's stores
 *  are left alone. */
export type View = { mute: { label: string; pressed: boolean }; newer: boolean } & (
  /** The controls changed, the idle page not yet solved for them: only what
   *  the eye is on while dragging or choosing - the reading under the
   *  slider, the boiling point beside the altitude, the start, the
   *  sentence; the full solve follows and draws the rest. */
  | { kind: 'unsolved'; reading: ReadingView; statBoil: string; start: UiStartMode; sentence: SetupFacts }
  /** Nothing solved yet: the sentence and the marks around it. */
  | { kind: 'blank'; learning: boolean; sentence: SetupFacts; startedAt: string | null }
  | ({ kind: 'idle' | 'running' | 'sous' } & Screen)
);

/** The egg previews the view draws, each worked out once for what it is of:
 *  the egg as eaten for a pot, a time and a level, and the solve of a cook as
 *  it ran. Handed in by the caller, who keeps it. */
export interface ViewMemo {
  preview: { key: string; view: SectionView | null };
  ran: { key: string; solution: Solution | null };
}

export function viewMemo(): ViewMemo {
  return { preview: { key: '', view: null }, ran: { key: '', solution: null } };
}

/** The page at `now_ms`. */
export function view(m: Model, now_ms: number, memo: ViewMemo): View {
  const mute = { label: t(m.settings.muted ? 'readout.mute.off' : 'readout.mute.on'), pressed: m.settings.muted };
  const newer = m.readOnly;
  if (m.cook === null && m.unsolved) {
    const shown = m.controls;
    return {
      mute: mute, newer: newer, kind: 'unsolved',
      reading: isSousVide(m) ? { level: shown.doneness, bath_C: SOUS_VIDE_BATH_C }
        : { level: shown.doneness, peakYolk_C: targetPeakYolk_C(shown.doneness) },
      statBoil: show('boilingPoint', boilingPoint_C(m)),
      start: shown.startMode,
      sentence: liveSetupFacts(shown, sizeClasses, currentEgg(m)),
    };
  }
  // The Learning mark: on the time while sharing is
  // on, since the time may then be nudged - and never in sous-vide, which
  // has no time to nudge.
  const learningOn = m.sharing && !isSousVide(m);
  // The sentence, in every phase: the controls' (the settings, or the
  // running cook's own choices).
  const sentence = liveSetupFacts(m.controls, sizeClasses, currentEgg(m));
  // When the eggs went in, in the start's panel, while a cook runs: the
  // sentence never says it.
  const startedAt = m.cook === null || m.controlsStart_s === null ? null : timeOfDay(m.controlsStart_s * 1000);
  const blank = { mute: mute, newer: newer, kind: 'blank' as const, learning: learningOn, sentence: sentence, startedAt: startedAt };
  // Sous-vide is answered honestly and separately: no cook to run, no
  // clock to start, and a start time that has already been and gone.
  if (isSousVide(m)) return { mute: mute, newer: newer, kind: 'sous', ...sousScreen(m, now_ms, sentence) };
  if (m.cook === null) {
    const sol = m.solution;
    if (sol === null) return blank;
    return { mute: mute, newer: newer, kind: 'idle', ...idleScreen(m, now_ms, memo, sol, learningOn, sentence) };
  }
  if (m.plan === null) return blank;
  return { mute: mute, newer: newer, kind: 'running', ...runningScreen(m, now_ms, memo, m.cook, m.plan, learningOn, sentence, startedAt) };
}

/* -------------------------------------------------------------- screens */

/** The controls, and the answer they give. */
function idleScreen(
  m: Model, now_ms: number, memo: ViewMemo, sol: Solution, learningOn: boolean, sentence: SetupFacts,
): Screen {
  // The warning line carries a refusal or the level's low odds while idle.
  // It is advice about the slider: popping "jammy isn't reachable" onto the
  // screen while the egg is already in the water would be advice about a
  // control the user cannot reach.
  const warning = m.idleAnswer === null ? '' : warningText(m.idleAnswer, m.settings);
  const sure = m.chosen !== null && sol.whiteSets ? m.chosen.certainty : null;
  const o = m.chosen !== null && sol.whiteSets ? m.outcome : null;
  const advice = adviceFor(m);
  // The egg the controls aim for, at the time on screen, as eaten.
  const pot = idlePot(m);
  const level = m.chosen?.level ?? m.settings.doneness;
  const aim = aimedEgg(m, memo, pot.egg, pot.setup, calibrationParams(m.calib), sol.result.cookTime_s, level);
  return {
    learning: learningOn, sentence: sentence, startedAt: null,
    statBoil: show('boilingPoint', boilingPoint_C(m)),
    note: textureNote(sol),
    reading: { level: m.settings.doneness, peakYolk_C: sol.result.peakYolk_C },
    scale: { solution: sol, odds: sol.whiteSets ? m.profile : null, bracket: sol.whiteSets ? m.chosen?.certainty.words ?? null : null },
    readout: readoutView(m, now_ms, sol, warning),
    // "Based on history" has an (i) that says what history.
    sublineInfo: m.settings.startMode === 'cold' && hasBoilMemory(m.boilMemory),
    certainty: certaintyView(sure, null),
    whiteRisk: o !== null && whiteAtRisk(o),
    // While a new pot's surface is on its way the lines above are blank,
    // and the readout would shrink and grow back a second later, moving the
    // sentence's open choice under the thumb that just tapped it: it keeps
    // the height it had when they were last all there.
    height: m.decision === null ? 'hold' : 'measure',
    advice: { link: advice.wanted && advice.surer, keys: advice.keys },
    // The one longer line under the egg while idle (UI.md section 3): a
    // refusal if there is one, and otherwise, before anything has been
    // learned, a welcome.
    welcome: warning === '' && m.calib.eggsLogged === 0 && !hasBoilMemory(m.boilMemory),
    section: { view: aim.view, reading: 'aim', key: `aim|${aim.key}` },
  };
}

/** The cook under way, on the same layout as idle: the readout, the
 *  slider's reading, shading and bracket from its plan, and the egg in
 *  cross-section as it is now. */
function runningScreen(
  m: Model, now_ms: number, memo: ViewMemo, cook: RunningCook, plan: CookPlan, learningOn: boolean,
  sentence: SetupFacts, startedAt: string | null,
): Screen {
  const sol = plan.solution;
  const shown = cookShown(cook, plan);
  const r = runningReading(m, now_ms, cook, plan);
  // A correction in hand (edit.ts) has the slider's reading of its own,
  // from a plan of the cook as it would be.
  const aim = m.aim;
  // The warning line while a cook runs, until the pull: what the plan says
  // of the level, as the idle screen says it (design/one-screen.md section
  // 3: a correction that leaves the white unset gets the longest time this
  // pan can give, and the slot says so), a refusal first. Then a restored
  // cook's warning, the opposite of a refusal, which only exists mid-cook,
  // and only while the cook is still in flight: at DONE the egg is out and
  // "keep this tab open" is advice about a deadline that has already passed.
  const phase = phaseNow(m, now_ms);
  const before = phase === 'HEATING' || phase === 'COOKING';
  const said = before ? warningText(plan.answer, cook.choices) : '';
  const refusal = before && refusalKey(plan.answer.verdict, cook.choices.cooling) !== null;
  const restored = pickedUpAfterReload(m) && phase !== 'DONE' ? t('readout.restored') : '';
  const warning = refusal || restored === '' ? said : restored;
  // Nothing past "still in the water?": not a caveat about the pull it
  // doubts.
  const asking = asksIfStillIn(plan);
  return {
    learning: learningOn, sentence: sentence, startedAt: startedAt,
    statBoil: show('boilingPoint', boilingPoint_C(m)),
    note: textureNote(aim?.solution ?? solutionShown(memo, cook, plan)),
    reading: aim !== null ? { level: aim.level, peakYolk_C: aim.peakYolk_C }
      : { level: shown?.level ?? plan.answer.level, peakYolk_C: shown?.peakYolk_C ?? sol.result.peakYolk_C },
    scale: { solution: sol, odds: sol.whiteSets ? r.profile : null, bracket: sol.whiteSets ? r.sure?.words ?? null : null },
    readout: readoutView(m, now_ms, sol, warning),
    sublineInfo: false,
    certainty: certaintyView(r.sure, { startedAt_s: cook.startedAt_s, cookTime_s: plan.cookTime_s }),
    whiteRisk: !asking && (r.ranWhite !== null ? r.ranWhite : r.outcome !== null && whiteAtRisk(r.outcome)),
    height: 'free',
    advice: { link: false, keys: [] },
    welcome: false,
    section: runningSection(m, now_ms, memo, cook, plan, shown),
  };
}

/** The sous-vide readout: hold times from the isothermal limit, and the
 *  plain statement that you should have started yesterday. No pan, no
 *  choice, and no odds: the bath's answer is not a guess about a pan (the
 *  decision chooses pan times). So no certainty line, and no bracket
 *  either. */
function sousScreen(m: Model, now_ms: number, sentence: SetupFacts): Screen {
  const egg = currentEgg(m);
  const doneness = calibrationDoneness(m.calib, m.settings.doneness);
  const est = sousVideEstimate(
    egg.radius_m, calibrationParams(m.calib).alpha_m2s, SOUS_VIDE_BATH_C,
    doneness.yolkDose_min, doneness.whiteDose_min,
  );
  const copy = sousVideCopy(est, now_ms);
  const words: PhaseView = {
    label: t('readout.phase.startTime'), digits: copy.headline, subline: copy.subline, spoken: '', primary: null,
    primaryDisabled: false, hint: copy.hint, secondaryVisible: false, asking: false,
  };
  return {
    learning: false, sentence: sentence, startedAt: null,
    statBoil: show('boilingPoint', boilingPoint_C(m)),
    note: copy.note,
    // The slider's reading is a pan number. There is no pan: the water's
    // temperature is not a peak yolk temperature, and the reading says
    // which number it is.
    reading: { level: m.settings.doneness, bath_C: est.bath_C },
    scale: 'bare',
    readout: {
      phase: 'IDLE', start: m.settings.startMode, warning: copy.warn, words: words, feedback: false, notes: null,
      target: null, probe: { shown: false, placeholder: null }, hintInfo: false,
      announce: {
        key: `SOUS|${copy.headline}`,
        text: t('spoken.sousVide', { when: midSentence(copy.headline, activeLocale()), subline: copy.subline }),
      },
    },
    sublineInfo: false,
    certainty: null,
    whiteRisk: false,
    height: 'free',
    advice: { link: false, keys: [] },
    welcome: false,
    section: null,
  };
}

/* -------------------------------------------------------------- readout */

/** The readout, the buttons under it and the questions at DONE, idle or not,
 *  with `warning` on the warning line. */
function readoutView(m: Model, now_ms: number, sol: Solution, warning: string): ReadoutView {
  const { settings, cook, plan } = m;
  const phase = phaseNow(m, now_ms);
  const shown = cookShown(cook, plan);
  const wanted = probeWanted(settings.probe, shown);
  const pending = probePending(m, phase, wanted);
  const words = phaseView(cook, plan, now_ms, {
    cookTime_s: sol.result.cookTime_s,
    whiteSets: sol.whiteSets,
    controls: {
      startMode: settings.startMode, afterBoil: settings.afterBoil, cooling: settings.cooling,
      waterLitres: settings.waterLitres, boiling_C: boilingPoint_C(m),
      timeToBoil_s: estimateTimeToBoil(m.boilMemory, settings.waterLitres),
    },
    boilKnown: hasBoilMemory(m.boilMemory),
    probeWanted: wanted,
    probePending: pending,
  });
  // The model is calibrated against the literature, not against this
  // kitchen. Asking once per egg is what closes that gap. Both questions
  // stay on screen until the cook moves on, answered or not; a reload after
  // an answer puts them away, since the second could no longer be folded.
  // Nor while a newer build's results are left alone (store.ts): no answer
  // could be kept.
  const feedback = phase === 'DONE' && m.questions !== 'away' && !words.asking && !m.readOnly;
  // The live region carries a coarse announcement, not a per-second one:
  // the ticking digits are aria-hidden, so a screen reader hears the phase
  // and the minute rather than being flooded once a second. The question is
  // its own announcement: it says what it asks.
  const minute = words.digits.split(':')[0];
  return {
    phase: phase, start: startModeNow(m), warning: warning, words: words, feedback: feedback,
    notes: feedback && !answeredHere(m) ? learning(m) : null,
    target: feedback ? targetText(shown) : null,
    probe: probeView(phase, shown),
    // The full rolling boil has an (i) that says what it looks like.
    hintInfo: phase === 'HEATING',
    announce: {
      key: `${phase}|${minute}`,
      text: words.asking ? words.spoken : t('spoken.announcement', { label: words.label, spoken: words.spoken }),
    },
  };
}

/** What the cook on screen was cooked for, over the yolk question, so the
 *  answer is graded against it: "You asked for: jammy, peak yolk 65 °C".
 *  The cook as it ran (`cookShown`) - the level it ran at, and the peak of
 *  the time that ran - never the slider now, nor a plan made since. Empty
 *  with no cook. */
function targetText(shown: CookShown | null): string {
  if (shown === null) return '';
  return t('feedback.target', {
    doneness: midSentence(t(anchorNear(shown.level).key), activeLocale()),
    yolk: show('temperature', shown.peakYolk_C),
  });
}

/** The reading's field at DONE, under the two questions, whenever this cook
 *  had a moment to probe, the cooling having ended at the yolk's peak, with
 *  the probe setting on or off. The − and + start from
 *  the peak of the cook that ran, shown greyed in the empty field: a
 *  suggestion, never taken as a reading until stepped or typed. */
function probeView(phase: Phase, shown: CookShown | null): { shown: boolean; placeholder: string | null } {
  const visible = phase === 'DONE' && shown !== null && shown.probeMoment;
  return {
    shown: visible,
    placeholder: visible && shown !== null ? String(nudgeFrom(measure('probeTemp'), shown.peakYolk_C)) : null,
  };
}

/** The texture note. Which band the egg falls in, and which keys say it,
 *  are core policy - including that a white the pan never sets is runny. */
function textureNote(sol: Solution): string {
  const note = textureNoteKeys(textureFor(sol.result.peakYolk_C, sol.result.peakWhite_C, sol.whiteSets));
  const parts: Record<string, string> = {};
  for (const [name, key] of Object.entries(note.parts)) parts[name] = t(key);
  return t(note.key, parts);
}

/** The solve the texture note reads while a cook runs: once the egg is out,
 *  the cook as it ran (`solutionAsRan`), like the peak
 *  and the white's line, so a plan made since on a posterior that has folded
 *  this egg's own answer never moves it; until then, the plan's. */
function solutionShown(memo: ViewMemo, cook: RunningCook, plan: CookPlan): Solution {
  const ran = asRanShown(cook, plan);
  if (ran === null) return plan.solution;
  const key = JSON.stringify([plan.egg, plan.setup, plan.cookTime_s, plan.inputs?.params ?? null, ran.params, ran.cook_s]);
  if (memo.ran.key !== key || memo.ran.solution === null) {
    memo.ran.solution = solutionAsRan(plan, ran);
    memo.ran.key = key;
  }
  return memo.ran.solution;
}

/* ------------------------------------------------------------ how sure */

/** What a running cook's plan says of how sure, as drawn: its certainty
 *  reading and outcome, and its pot's odds profile for the track's shading,
 *  as held (model.ts, `held`) while a new pot's surface is on its way,
 *  until the pull, when the time they were about has passed
 *  (design/one-screen.md section 7, 12). The white's line stays to the
 *  end; once the egg is out it is the cook's as it ran, not a plan made
 *  since, which may know how the egg came out. */
interface RunningReading {
  outcome: Outcome | null;
  sure: CertaintyReading | null;
  profile: OddsProfile | null;
  ranWhite: boolean | null;
}

function runningReading(m: Model, now_ms: number, cook: RunningCook, plan: CookPlan): RunningReading {
  const held = m.held !== null && m.held.id_ms === cook.id_ms ? m.held : null;
  const phase = phaseNow(m, now_ms);
  const pulled = phase === 'PULL' || phase === 'COOLING' || phase === 'DONE';
  const whiteSets = plan.solution.whiteSets;
  const ran = pulled ? asRanShown(cook, plan) : null;
  return {
    outcome: whiteSets ? held?.outcome ?? null : null,
    sure: whiteSets && !pulled ? held?.certainty ?? null : null,
    profile: whiteSets && !pulled ? held?.profile ?? null : null,
    ranWhite: ran !== null ? whiteSets && forecastWhiteAtRisk(ran.forecast) : null,
  };
}

/** A key with its counts and its doneness words, rendered. */
function words(ref: WordsRef): string {
  const args: Record<string, string | number> = { ...ref.args };
  for (const [name, key] of Object.entries(ref.words)) args[name] = t(key);
  return t(ref.key, args);
}

/** How sure I am of the time on screen, under it (src/core/wording.ts, "How
 *  sure, in words"): the class as a line the cook
 *  presses, which opens in place the 90% interval in the slider's words, the
 *  most likely word, the likely time range and the way to Help. "Most
 *  likely" shows under the line unpressed when it is not the word asked, and
 *  is then not said again in what opens, nor after a one-word interval
 *  (`mostLikelyOpened`). While a cook runs (`running`, its start and its
 *  plan's time now) the likely time range is when to take the eggs out, as
 *  times of day, not whole times under a clock counting down (core
 *  `timeRangeWords`). */
function certaintyView(
  sure: CertaintyReading | null, running: { startedAt_s: number; cookTime_s: number } | null,
): CertaintyView | null {
  if (sure === null) return null;
  const w = sure.words;
  const range = timeRangeWords(sure, running);
  const said = (s: number): string => (range.ofDay ? timeOfDay(s * 1000) : formatClock(s));
  return {
    word: t(certaintyKey(w.certainty)),
    likely: words(mostLikelyWords(w)),
    under: mostLikelyShown(w),
    opened: mostLikelyOpened(w),
    interval: words(intervalWords(w)),
    time: t(range.key, { low: said(range.low_s), high: said(range.high_s) }),
  };
}

/* -------------------------------------------- the egg in cross-section */

/**
 * The egg in cross-section has three readings (design/one-screen.md section
 * 5), named on the drawing as `data-egg`:
 *
 * - `aim`: the egg the settings on screen aim for, at the end of the
 *   cooling, the egg as eaten (`previewSection`): at idle, the controls' egg
 *   at the time on screen; during a cook, while a control is held and for a
 *   moment after (edit.ts, the model's `aim`), the egg the correction in
 *   hand would cook.
 * - `live`: the egg in the water now, carried forward a tick at a time and
 *   replayed from raw when the cook's pot or start changes, on through the
 *   cooling (model.ts, `live`).
 * - `ran`: at Done, the egg as it ran, eaten: the time that ran, to the egg
 *   out, with the model's parameters it ran under.
 */
export function aimedEgg(
  m: Model, memo: ViewMemo, e: Egg, setup: CookSetup, params: ModelParams, cookTime_s: number, level: number,
): { view: SectionView; key: string } {
  const white = calibrationDoneness(m.calib, level).whiteDose_min;
  const key = JSON.stringify([e, setup, params, cookTime_s, white]);
  if (memo.preview.view === null || memo.preview.key !== key) {
    memo.preview.view = previewSection(e, setup, params, cookTime_s, white);
    memo.preview.key = key;
  }
  return { view: memo.preview.view, key: key };
}

/** The egg in cross-section while a cook runs: the aim of a correction in
 *  hand, or the egg as it ran at Done, or the live egg. At the posterior
 *  mean, the same egg the countdown times, in the pot its plan has now; once
 *  the egg is out, with the model's parameters it ran under, so a fold of
 *  this egg's own answer does not redraw it. */
function runningSection(
  m: Model, now_ms: number, memo: ViewMemo, cook: RunningCook, plan: CookPlan, shown: CookShown | null,
): SectionDraw | null {
  if (m.aim !== null && m.aim.section !== null) return { view: m.aim.section, reading: 'aim', key: 'held' };
  const params = shown?.params ?? calibrationParams(m.calib);
  const level = shown?.level ?? plan.answer.level;
  const pulled = cook.events.pulled;
  const out_s = pulled === null ? null : pulled.out_s - cook.startedAt_s;
  if (out_s !== null && phaseNow(m, now_ms) === 'DONE') {
    const ran = aimedEgg(m, memo, plan.egg, plan.setup, params, out_s, level);
    return { view: ran.view, reading: 'ran', key: `ran|${ran.key}` };
  }
  if (m.live === null) return null;
  return { view: sectionView(m.live.section, calibrationDoneness(m.calib, level).whiteDose_min), reading: 'live', key: 'live' };
}
