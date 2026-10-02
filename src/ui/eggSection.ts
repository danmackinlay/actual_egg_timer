/**
 * The egg in cross-section, drawn (src/core/section.ts has the physics).
 *
 * The model's egg is a sphere; this one is drawn as an egg. Each ring of the
 * section is a closed outline, and the outlines are filled outermost first,
 * each in its ring's colour, so the one inside covers all but the band
 * between them. The yolk is round, as a real one is; through the white the
 * outlines turn from that circle into the shell's ovoid, blunt end up.
 *
 * Built from what both apps can draw the same way: a list of points per ring
 * (`ringPoints`) and an opaque colour per ring (`ringFills`). On iOS the same
 * points go into a `Path`, and the same fills come from `Palette`. Every fill
 * is opaque - a translucent one would show the rings beneath it through - so
 * a "clear" white is a colour of its own (`--white-raw`), not an opacity.
 *
 * Two ways of colouring the same rings, for the owner to choose between on a
 * phone: how set each layer is (`state`), or its temperature (`heat`).
 * Nothing here touches the document when the module is imported.
 */

import { EGG_LENGTH_RATIO, YOLK_RADIUS_FRAC } from '../core/constants.js';
import { SectionView } from '../core/section.js';

export type SectionMode = 'state' | 'heat';

/* ------------------------------------------------------------- the outline */

/** The shell's half-length, blunt end to centre, before the taper. The
 *  drawing's unit. */
const HALF_LENGTH = 1.0;
/** Its half-width: the egg the model assumes, 1.35 times as long as wide. */
const HALF_WIDTH = HALF_LENGTH / EGG_LENGTH_RATIO;
/** How much longer the blunt end is than the pointed end, as a fraction of
 *  the half-length. The yolk sits at the centre, so toward the blunt end. */
const TAPER = 0.14;
/** Points per outline. */
const OUTLINE_POINTS = 72;

/** The shell's distance from the yolk's centre at angle `theta` (0 to the
 *  right, pi/2 up, toward the blunt end): an ellipse about the centre,
 *  stretched by 1 + TAPER at the top and shrunk by 1 - TAPER at the bottom. */
export function shellRadius(theta: number): number {
  const c = Math.cos(theta) / HALF_WIDTH;
  const s = Math.sin(theta) / HALF_LENGTH;
  return (1.0 + TAPER * Math.sin(theta)) / Math.sqrt(c * c + s * s);
}

/** The outline of everything inside `x` (r/R): a circle across the yolk,
 *  turning into the shell's ovoid evenly across the white. Points are in
 *  drawing units, y up. */
export function ringPoints(x: number): [number, number][] {
  const w = x <= YOLK_RADIUS_FRAC ? 0.0 : (x - YOLK_RADIUS_FRAC) / (1.0 - YOLK_RADIUS_FRAC);
  const points: [number, number][] = [];
  for (let i = 0; i < OUTLINE_POINTS; i++) {
    const theta = 2.0 * Math.PI * i / OUTLINE_POINTS;
    const r = x * ((1.0 - w) * HALF_WIDTH + w * shellRadius(theta));
    points.push([r * Math.cos(theta), r * Math.sin(theta)]);
  }
  return points;
}

/** The drawing's bounds, y up: the shell's extent, and a hair for its line. */
export const SECTION_BOX = {
  left: -HALF_WIDTH * 1.06,
  right: HALF_WIDTH * 1.06,
  top: HALF_LENGTH * (1.0 + TAPER) + 0.03,
  bottom: -HALF_LENGTH * (1.0 - TAPER) - 0.03,
};

/** An outline as SVG path data, y flipped to SVG's downward axis. */
export function pathData(points: [number, number][]): string {
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
  /** The heat map's stops, coldest first, at `HEAT_STOPS_C`. */
  heat: Rgb[];
}

/** Where the heat map's colours sit, C: blue from the ice to the room, a
 *  neutral grey at 40 C where nothing in an egg has begun to set, red toward
 *  the boil. Two hues and a grey, never a rainbow. */
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
export function yolkAt(level: number, p: SectionPalette): Rgb {
  if (level <= YOLK_JAMMY_AT) return mix(p.yolkRunny, p.yolkJammy, Math.max(0, level) / YOLK_JAMMY_AT);
  return mix(p.yolkJammy, p.yolkHard, (Math.min(1, level) - YOLK_JAMMY_AT) / (1 - YOLK_JAMMY_AT));
}

/** A temperature on the heat map. */
export function heatAt(temperature_C: number, p: SectionPalette): Rgb {
  const stops = HEAT_STOPS_C;
  if (temperature_C <= stops[0]) return p.heat[0];
  for (let i = 1; i < stops.length; i++) {
    if (temperature_C <= stops[i]) {
      return mix(p.heat[i - 1], p.heat[i], (temperature_C - stops[i - 1]) / (stops[i] - stops[i - 1]));
    }
  }
  return p.heat[stops.length - 1];
}

/** Each ring's fill, in ring order (centre first). In `heat` mode,
 *  `uniform_C`, when not null, stands in for every ring's temperature: the
 *  first second of a cook, before the series has settled (section.ts). */
export function ringFills(
  view: SectionView, mode: SectionMode, p: SectionPalette, uniform_C: number | null,
): string[] {
  const fills: string[] = [];
  for (let i = 0; i < view.x.length; i++) {
    if (mode === 'heat') {
      fills.push(hex(heatAt(uniform_C ?? view.temperature_C[i], p)));
    } else {
      fills.push(hex(view.yolk[i] ? yolkAt(view.set[i], p) : mix(p.whiteRaw, p.whiteSet, view.set[i])));
    }
  }
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

function parseHex(value: string): Rgb {
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
    heat: ['--heat-cold', '--heat-cool', '--heat-mid', '--heat-warm', '--heat-hot'].map(read),
  };
}
