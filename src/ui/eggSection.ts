/**
 * The egg in cross-section, drawn (src/core/section.ts has the physics).
 *
 * The model's egg is a sphere; this one is drawn as an egg. Each ring of the
 * section is a closed outline, and the outlines are filled outermost first,
 * each in its ring's colour, so the one inside covers all but the band
 * between them. The yolk is round, as a real one is; through the white the
 * outlines turn from that circle into the shell's egg, standing on its
 * blunt end rather than balanced on its point.
 *
 * Built from what both apps can draw the same way: a list of points per ring
 * (`ringPoints`) and an opaque colour per ring (`ringFills`). On iOS the same
 * points go into a `Path`, and the same fills come from `Palette`. Every fill
 * is opaque - a translucent one would show the rings beneath it through - so
 * a "clear" white is a colour of its own (`--white-raw`), not an opacity.
 *
 * The app colours the rings by how set each layer is (`ringFills`). The
 * same rings by temperature (`heatFills`) were the prototype's other picture;
 * the owner chose how set, and the heat map lives on in the lab page
 * (tools/egg-section.html) for a day it might be wanted.
 * Nothing here touches the document when the module is imported.
 */

import { EGG_LENGTH_RATIO, YOLK_RADIUS_FRAC } from '../core/constants.js';
import { SectionView } from '../core/section.js';

/* ------------------------------------------------------------- the outline */

/** The shell's half-length, the drawing's unit. */
const HALF_LENGTH = 1.0;
/** Its half-width at the middle: the egg the model assumes, 1.35 times as
 *  long as wide. */
const HALF_WIDTH = HALF_LENGTH / EGG_LENGTH_RATIO;
/** How much the width swells toward the blunt end, at the bottom, and
 *  narrows toward the pointed one, at the top: the shell's half-width at
 *  height y is HALF_WIDTH times (1 - TAPER y), so the pointed end is
 *  narrower as well as the blunt end rounder - an egg, not an oval
 *  stretched at one end. */
const TAPER = 0.18;
/** How far the yolk's centre sits below the egg's middle, toward the blunt
 *  end. */
const YOLK_DROP = 0.06;
/** Points per outline. */
const OUTLINE_POINTS = 72;

/** The shell at parameter `t` (0 to the right, pi/2 up, toward the pointed
 *  end), relative to the yolk's centre, y up. */
function shellPoint(t: number): [number, number] {
  return [
    HALF_WIDTH * Math.cos(t) * (1.0 - TAPER * Math.sin(t)),
    HALF_LENGTH * Math.sin(t) + YOLK_DROP,
  ];
}

/** The outline of everything inside `x` (r/R): a circle across the yolk,
 *  turning into the shell's egg evenly across the white. Points are in
 *  drawing units, y up, the yolk's centre at the origin. */
export function ringPoints(x: number): [number, number][] {
  const w = x <= YOLK_RADIUS_FRAC ? 0.0 : (x - YOLK_RADIUS_FRAC) / (1.0 - YOLK_RADIUS_FRAC);
  const points: [number, number][] = [];
  for (let i = 0; i < OUTLINE_POINTS; i++) {
    const t = 2.0 * Math.PI * i / OUTLINE_POINTS;
    const shell = shellPoint(t);
    points.push([
      x * ((1.0 - w) * HALF_WIDTH * Math.cos(t) + w * shell[0]),
      x * ((1.0 - w) * HALF_WIDTH * Math.sin(t) + w * shell[1]),
    ]);
  }
  return points;
}

/** The drawing's bounds, y up: the shell's extent, and a hair for its line. */
const SECTION_BOX = (() => {
  let left = 0, right = 0, top = 0, bottom = 0;
  for (const [px, py] of ringPoints(1.0)) {
    left = Math.min(left, px);
    right = Math.max(right, px);
    top = Math.max(top, py);
    bottom = Math.min(bottom, py);
  }
  const pad = 0.03;
  return { left: left - pad, right: right + pad, top: top + pad, bottom: bottom - pad };
})();

/** An outline as SVG path data, y flipped to SVG's downward axis. */
function pathData(points: [number, number][]): string {
  let d = '';
  for (let i = 0; i < points.length; i++) {
    d += `${i === 0 ? 'M' : 'L'}${points[i][0].toFixed(4)} ${(-points[i][1]).toFixed(4)}`;
  }
  return d + 'Z';
}

/* -------------------------------------------------------------- the colours */

export type Rgb = [number, number, number];

/** The colours a section is drawn in, from the page's palette
 *  (`readPalette`), or a test's. */
export interface SectionPalette {
  yolkRunny: Rgb;
  yolkJammy: Rgb;
  yolkHard: Rgb;
  whiteRaw: Rgb;
  whiteSet: Rgb;
}

/** Where the heat map's colours sit, C: blue from the ice to the room, a
 *  neutral grey at 40 C where nothing in an egg has begun to set, red toward
 *  the boil. Two hues and a grey, never a rainbow. The lab's only. */
export const HEAT_STOPS_C = [0, 20, 40, 70, 100];

/** Where the yolk's middle colour sits on the slider, as on the track
 *  (styles.css `.slider__odds`, iOS `Palette.yolkJammyAt`). */
const YOLK_JAMMY_AT = 0.41;

function mix(a: Rgb, b: Rgb, f: number): Rgb {
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

function hex(c: Rgb): string {
  let s = '#';
  for (const v of c) s += Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return s;
}

/** The yolk at a slider level, as the track draws it. */
function yolkAt(level: number, p: SectionPalette): Rgb {
  if (level <= YOLK_JAMMY_AT) return mix(p.yolkRunny, p.yolkJammy, Math.max(0, level) / YOLK_JAMMY_AT);
  return mix(p.yolkJammy, p.yolkHard, (Math.min(1, level) - YOLK_JAMMY_AT) / (1 - YOLK_JAMMY_AT));
}

/** Each ring's fill, in ring order (centre first), by how set it is: the
 *  yolk on the slider track's colours, the white from clear to set. */
export function ringFills(view: SectionView, p: SectionPalette): string[] {
  const fills: string[] = [];
  for (let i = 0; i < view.x.length; i++) {
    fills.push(hex(view.yolk[i] ? yolkAt(view.set[i], p) : mix(p.whiteRaw, p.whiteSet, view.set[i])));
  }
  return fills;
}

/** A temperature on the heat map, whose colours `heat` are at
 *  `HEAT_STOPS_C`. */
export function heatAt(temperature_C: number, heat: Rgb[]): Rgb {
  const stops = HEAT_STOPS_C;
  if (temperature_C <= stops[0]) return heat[0];
  for (let i = 1; i < stops.length; i++) {
    if (temperature_C <= stops[i]) {
      return mix(heat[i - 1], heat[i], (temperature_C - stops[i - 1]) / (stops[i] - stops[i - 1]));
    }
  }
  return heat[stops.length - 1];
}

/** Each ring's fill by its temperature, for the lab. `uniform_C`, when not
 *  null, stands in for every ring's: the first second of a cook, before the
 *  series has settled (section.ts). */
export function heatFills(view: SectionView, heat: Rgb[], uniform_C: number | null): string[] {
  const fills: string[] = [];
  for (let i = 0; i < view.x.length; i++) fills.push(hex(heatAt(uniform_C ?? view.temperature_C[i], heat)));
  return fills;
}

/* ------------------------------------------------------------- the drawing */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Fill `svg` with one path per ring, outermost first, and the shell's line
 *  over them. Once: after this only the fills change. `outer` is the rings'
 *  outer edges (`SectionView.outer`), centre first. */
export function buildEggSection(svg: SVGSVGElement, outer: number[]): void {
  const box = SECTION_BOX;
  svg.setAttribute('viewBox', `${box.left} ${-box.top} ${box.right - box.left} ${box.top - box.bottom}`);
  svg.replaceChildren();
  for (let i = outer.length - 1; i >= 0; i--) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', pathData(ringPoints(outer[i])));
    path.dataset['ring'] = String(i);
    svg.appendChild(path);
  }
  const shell = document.createElementNS(SVG_NS, 'path');
  shell.setAttribute('d', pathData(ringPoints(1.0)));
  shell.setAttribute('class', 'egg-section__shell');
  shell.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.appendChild(shell);
}

/** Colour the rings `buildEggSection` made. */
export function paintEggSection(svg: SVGSVGElement, fills: string[]): void {
  const paths = svg.querySelectorAll<SVGPathElement>('path[data-ring]');
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    const fill = fills[Number(path.dataset['ring'])];
    if (path.getAttribute('fill') !== fill) path.setAttribute('fill', fill);
  }
}

export function parseHex(value: string): Rgb {
  const v = value.trim().replace('#', '');
  const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

/** The palette as the page's stylesheet has it now, light or dark. */
export function readPalette(from: Element): SectionPalette {
  const style = getComputedStyle(from);
  const read = (name: string): Rgb => parseHex(style.getPropertyValue(name));
  return {
    yolkRunny: read('--yolk-runny'),
    yolkJammy: read('--yolk-jammy'),
    yolkHard: read('--yolk-hard'),
    whiteRaw: read('--white-raw'),
    whiteSet: read('--white-set'),
  };
}
