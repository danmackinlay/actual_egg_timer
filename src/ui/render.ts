/**
 * The egg page drawn: what `view` says it shows (view.ts), written to the
 * page. One writer, run once an animation frame for whatever changed since
 * (cook.ts, `requestDraw`). It decides nothing; what it keeps (`Drawn`,
 * handed in by the caller, who keeps it) is what is on the page now, so a
 * word, a list or the egg is written only when it changed, and the
 * readout's height while the lines under it are blank. Then the version on
 * Settings, written once.
 */

import { t } from './copy.js';
import { page } from './dom.js';
import { buildEggSection, paintEggSection, readPalette, ringFills } from './eggSection.js';
import { showInfo } from './info.js';
import { drawForm } from './controls.js';
import { drawLearned, renderCalibNote } from './learned.js';
import type { Redraws } from './model.js';
import { drawShare } from './shareView.js';
import { renderSentence } from './sentence.js';
import { renderBareScale, renderDonenessReading, renderDonenessScale } from './slider.js';
import { APP_VERSION } from './version.js';
import { CertaintyView, ReadingView, ReadoutView, SectionDraw, Sections, View } from './view.js';

/** What is on the page now, as far as the writer needs to know it. */
export interface Drawn {
  /** The readout's height, px, the last time it was drawn idle with a
   *  decision in: what it holds while the next one is on its way. */
  readout_px: number;
  /** The live region's last announcement, by what it is of. */
  announced: string;
  /** The advice's keys, as listed. */
  advice: string;
  /** The egg's rings as built, and the drawing painted. */
  rings: string;
  painted: SectionDraw['view'] | null;
  reading: SectionDraw['reading'] | null;
  /** The parts drawn only when asked, as last drawn (null: none yet), and
   *  the line over the questions. */
  redraws: Redraws | null;
  note: number;
}

export function drawnNothing(): Drawn {
  return { readout_px: 0, announced: '', advice: '', rings: '', painted: null, reading: null, redraws: null, note: -1 };
}

/** The parts of the page drawn only when `update` asks for them, each whose
 *  count has moved since it was last drawn. */
function drawSections(s: Sections, d: Drawn): void {
  const was = d.redraws;
  const moved = (part: keyof Redraws): boolean => was === null || s.redraws[part] !== was[part];
  if (moved('words')) {
    // A new language: the words drawn only when they change, drawn again.
    d.advice = '';
    d.announced = '';
  }
  drawForm(s.form, s.redraws, was, s.echoSource);
  if (s.note.rev !== d.note) page().calibNote.textContent = s.note.text;
  if (moved('learned')) drawLearned(s.learned);
  if (moved('share') && s.share !== null) drawShare(s.share);
  d.redraws = s.redraws;
  d.note = s.note.rev;
}

/** Draw `v` over what `d` says is there. */
export function draw(v: View, d: Drawn): void {
  drawSections(v.sections, d);
  page().mute.textContent = v.mute.label;
  page().mute.setAttribute('aria-pressed', v.mute.pressed ? 'true' : 'false');
  page().newerNote.hidden = !v.newer;
  if (v.kind === 'unsolved') {
    drawReading(v.reading);
    page().statBoil.textContent = v.statBoil;
    page().body.dataset['start'] = v.start;
    renderSentence(v.sentence);
    return;
  }
  page().learning.hidden = !v.learning;
  showInfo(page().learningInfo, v.learning);
  renderSentence(v.sentence);
  page().startedAtField.hidden = v.startedAt === null;
  if (v.startedAt !== null) page().startedAt.textContent = v.startedAt;
  if (v.kind === 'blank') return;

  page().statBoil.textContent = v.statBoil;
  page().note.textContent = v.note;
  drawReading(v.reading);
  if (v.scale === 'bare') renderBareScale();
  else renderDonenessScale(v.scale.solution, v.scale.odds, v.scale.bracket);
  drawReadout(v.readout, d, v.newer);
  showInfo(page().sublineInfo, v.sublineInfo);
  drawCertainty(v.certainty);
  page().whiteRisk.hidden = !v.whiteRisk;
  drawHeight(v.height, d);
  drawAdvice(v.advice, d);
  page().welcome.hidden = !v.welcome;
  if (v.section !== null) drawSection(v.section, d);
}

function drawReading(r: ReadingView): void {
  renderDonenessReading(r.level, 'bath_C' in r ? { bath_C: r.bath_C } : { peakYolk_C: r.peakYolk_C });
}

/** The readout, the buttons under it and the questions at Done. */
function drawReadout(r: ReadoutView, d: Drawn, readOnly: boolean): void {
  page().body.dataset['phase'] = r.phase;
  page().body.dataset['start'] = r.start;
  page().warn.textContent = r.warning;
  page().warn.hidden = r.warning === '';
  const w = r.words;
  page().primary.textContent = w.primary ?? '';
  page().primary.hidden = w.primary === null;
  page().primary.disabled = w.primaryDisabled;
  page().primaryHintText.textContent = w.hint;
  page().secondary.hidden = !w.secondaryVisible;
  if (w.secondaryVisible) page().secondary.textContent = t('action.cancel');
  // "Still in the water?": the primary says yes, and this says no.
  page().stillOut.hidden = !w.asking;
  page().feedback.hidden = !r.feedback;
  if (r.notes !== null) renderCalibNote(r.notes, readOnly);
  page().probeEntry.hidden = !r.probe.shown;
  if (r.probe.placeholder !== null) page().probeReading.placeholder = r.probe.placeholder;
  if (r.target !== null) {
    page().feedbackTarget.hidden = r.target === '';
    if (r.target !== '') page().feedbackTarget.textContent = r.target;
  }
  page().phaseLabel.textContent = w.label;
  page().digits.textContent = w.digits;
  page().sublineText.textContent = w.subline;
  showInfo(page().hintInfo, r.hintInfo);
  if (r.announce.key !== d.announced) {
    d.announced = r.announce.key;
    page().announce.textContent = r.announce.text;
  }
}

/** The certainty line and what it opens; the opening is the cook's to
 *  press (`aria-expanded`). */
function drawCertainty(c: CertaintyView | null): void {
  const word = page().certaintyWord;
  word.hidden = c === null;
  page().certaintyMore.hidden = c === null || word.getAttribute('aria-expanded') !== 'true';
  if (c === null) {
    page().mostLikely.hidden = true;
    return;
  }
  word.textContent = c.word;
  page().mostLikely.hidden = !c.under;
  page().mostLikely.textContent = c.under ? c.likely : '';
  page().certaintyInterval.textContent = c.interval;
  page().certaintyLikely.hidden = !c.opened;
  page().certaintyLikely.textContent = c.opened ? c.likely : '';
  page().certaintyTime.textContent = c.time;
}

/** The readout's height while the lines under the time are blank: the
 *  height it had when they were last all there, so nothing moves when they
 *  arrive. Measured only while idle: reading the height forces a layout,
 *  and a running cook, drawn five times a second, has no choice to keep
 *  still. */
function drawHeight(height: 'free' | 'hold' | 'measure', d: Drawn): void {
  if (height === 'hold') {
    page().readout.style.minHeight = d.readout_px > 0 ? `${d.readout_px}px` : '';
    return;
  }
  page().readout.style.minHeight = '';
  if (height === 'free') return;
  const px = page().readout.offsetHeight;
  if (px > 0) d.readout_px = px;
}

/** The way to Help, and what would help this setup. */
function drawAdvice(a: { link: boolean; keys: string[] }, d: Drawn): void {
  page().advice.hidden = !a.link;
  page().forYou.hidden = a.keys.length === 0;
  const shown = a.keys.join(' ');
  if (shown === d.advice) return;
  d.advice = shown;
  page().adviceList.replaceChildren(...a.keys.map((key) => {
    const li = document.createElement('li');
    li.textContent = t(key);
    return li;
  }));
}

/** The egg in cross-section, painted when what it shows changed, its rings
 *  built again when they did; named on the drawing as `data-egg`. */
function drawSection(s: SectionDraw, d: Drawn): void {
  if (s.view === d.painted && s.reading === d.reading) return;
  const svg = page().eggSection;
  const rings = JSON.stringify(s.view.outer);
  if (rings !== d.rings) {
    buildEggSection(svg, s.view.outer);
    d.rings = rings;
  }
  paintEggSection(svg, ringFills(s.view, readPalette(page().body)));
  svg.dataset['egg'] = s.reading;
  d.painted = s.view;
  d.reading = s.reading;
}

/** The last line of Settings, "Version 0.4.0-alpha.1": the words from the
 *  catalogue, the number in a span of its own, fixed-width, so that the 1750
 *  face never draws its 0 as an o. Selectable, like the random number. */
export function renderVersion(): void {
  const mark = '\u0001';
  const [before = '', after = ''] = t('colophon.version', { version: mark }).split(mark);
  const number = document.createElement('span');
  number.className = 'colophon__number';
  number.translate = false;
  number.textContent = APP_VERSION;
  page().appVersion.replaceChildren(before, number, after);
}
