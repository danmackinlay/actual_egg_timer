// `npm run ios:shots`: the App Store's screenshots, captioned, in English
// (Australia), at the two sizes App Store Connect takes for an iPhone: the
// iPhone 17 Pro's 1206 x 2622 (required) and the 17 Pro Max's 1320 x 2868.
//
// Each shot is a Debug build on a simulator of the tool's own, driven as
// `npm run ios:e2e` drives it, by a UI test of its own (`Shots`,
// ios/UITests/Shots.swift): the clock frozen and stepped to the moment
// shown, the buttons tapped, the status bar at 9:41 and the cook started at
// 9:38, and the screen captured by the test. The device's screen is then set
// under its caption (ios/appstore/captions.en-AU.json), in the web's palette
// (styles.css) and the system's face, light or dark as the shot is, and
// rendered at the display's exact pixels by headless Chrome (tools/chrome.ts).
//
//   npm run ios:shots                every shot, both sizes
//   npm run ios:shots -- 03 05       those shots (by number)
//   --no-build                       the last build in ios/build/e2e
//   --no-capture                     the captions set again on the last capture
//
// The images land in ios/appstore/shots/<size>/NN-what.png, gitignored and
// kept by every build, the device's own screens under raw/. Uploading them
// is the owner's step, in App Store Connect (ios/RELEASING.md), never this
// tool's. The Lock Screen's Live Activity is not among them: simctl cannot
// lock a simulator (`io … screenConfig power off` only blanks it), and
// Device > Lock is the Simulator app's menu, driven by hand.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { Cdp, launchChrome, sleep } from './chrome.ts';
import { APP, UI_ENV, build, createDevice, quietly, simctl, uiTest, uiWarmUp } from './iosHarness.ts';

const OUT = 'ios/appstore/shots';
const CAPTIONS = 'ios/appstore/captions.en-AU.json';

/// The displays App Store Connect asks for, each an iPhone the simulator runs.
const DISPLAYS = [
  { model: 'iPhone 17 Pro', dir: '6.3in-1206x2622', width: 1206, height: 2622 },
  { model: 'iPhone 17 Pro Max', dir: '6.9in-1320x2868', width: 1320, height: 2868 },
];

/// One shot: its file's name, which names its test (`test_shot_01_time` for
/// `01-time`, ios/UITests/Shots.swift), where how the app is brought to it
/// is; and its scheme.
interface Shot { file: string; dark?: boolean }

const SHOTS: Shot[] = [
  { file: '01-time' }, { file: '02-setting' }, { file: '03-heat', dark: true }, { file: '04-done' },
  { file: '05-eggcup' },
];

/// The status bar's clock as Apple's own screenshots draw it, "9:41" and
/// never "09:41". `--time 9:41` is drawn in the device's own clock, which
/// `simctl create` copies from the host's, 24-hour on a Mac set so; the
/// app's launch arguments (`localeArgs`) reach the app and not the status
/// bar. So the device is told its clock is not forced to 24 hours, and
/// booted again, since the status bar reads it only at boot.
function twelveHourClock(udid: string): void {
  simctl('spawn', udid, 'defaults', 'write', '-g', 'AppleICUForce24HourTime', '-bool', 'NO');
  simctl('shutdown', udid);
  simctl('boot', udid);
  simctl('bootstatus', udid, '-b');
}

/// The device's screen in the shot, at `<dir>/<file>.png`: the shot's test
/// run on a fresh install, in the shot's scheme, which brings the app to it
/// from 9:38 and takes the screen once it is still.
function capture(udid: string, shot: Shot, dir: string): void {
  simctl('ui', udid, 'appearance', shot.dark ? 'dark' : 'light');
  const path = join(dir, `${shot.file}.png`);
  rmSync(path, { force: true });
  const r = uiTest(udid, `Shots/test_shot_${shot.file.replace(/-/g, '_')}`, { ...UI_ENV, AET_SHOTS_DIR: resolve(dir) });
  if (!r.passed || !existsSync(path)) throw new Error(`${shot.file}: ${r.failures.join('; ') || 'no capture'}`);
}

/// A colour of styles.css, `--name`, in its dark (first) or light block.
function colour(name: string, dark: boolean): string {
  const css = readFileSync('styles.css', 'utf8');
  const light = css.indexOf('@media (prefers-color-scheme: light)');
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(dark ? css.slice(0, light) : css.slice(light));
  if (!m) throw new Error(`styles.css has no --${name}`);
  return m[1]!;
}

/// The page a shot is composed on, at the display's pixels: the caption
/// above, and under it the device's screen, inset, with the display's
/// rounded corners.
function page(d: (typeof DISPLAYS)[number], image: string, caption: string, dark: boolean): string {
  const w = d.width;
  const head = Math.round(0.31 * w);
  const tall = d.height - head - Math.round(0.07 * w);
  const wide = Math.round((tall * w) / d.height);
  const text = caption.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!doctype html><meta charset="utf-8"><style>
html, body { margin: 0; width: ${w}px; height: ${d.height}px; overflow: hidden; background: ${colour('bg', dark)}; }
body { display: flex; flex-direction: column; align-items: center; color: ${colour('fg', dark)};
  font-family: -apple-system, system-ui, sans-serif; }
h1 { box-sizing: border-box; height: ${head}px; margin: 0; padding: ${Math.round(0.11 * w)}px ${Math.round(0.08 * w)}px 0;
  font-size: ${Math.round(0.072 * w)}px; line-height: 1.12; font-weight: 700; letter-spacing: -0.01em;
  text-align: center; text-wrap: balance; }
img { display: block; width: ${wide}px; height: ${tall}px; border-radius: ${Math.round(0.137 * wide)}px;
  outline: ${Math.max(2, Math.round(w / 400))}px solid ${colour('line', dark)}; }
</style><h1>${text}</h1><img src="${image}">`;
}

/// A PNG's pixels and whether it has an alpha channel (colour type 4 or 6),
/// from its header: App Store Connect refuses one with alpha. Chrome writes
/// an opaque page's screenshot without.
function header(png: Buffer): { width: number; height: number; alpha: boolean } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20), alpha: (png[25]! & 4) !== 0 };
}

/// Each shot's raw capture under its caption, at each display's pixels.
async function compose(shots: Shot[]): Promise<void> {
  const captions = (JSON.parse(readFileSync(CAPTIONS, 'utf8')) as { captions: { shot: string; text: string }[] }).captions;
  const chrome = await launchChrome(['about:blank'], 9600 + Math.floor(Math.random() * 300));
  const cdp = await Cdp.open(await chrome.socket());
  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }) as { targetId: string };
    const { sessionId: s } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }) as { sessionId: string };
    for (const d of DISPLAYS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: d.width, height: d.height, deviceScaleFactor: 1, mobile: false }, s);
      for (const shot of shots) {
        const caption = captions.find((c) => c.shot === shot.file)?.text;
        if (caption === undefined) throw new Error(`${CAPTIONS} has no caption for ${shot.file}`);
        const raw = resolve(OUT, 'raw', d.dir, `${shot.file}.png`);
        if (!existsSync(raw)) throw new Error(`no capture at ${raw}`);
        const html = join(OUT, 'raw', d.dir, `${shot.file}.html`);
        writeFileSync(html, page(d, `file://${raw}`, caption, shot.dark ?? false));
        await cdp.send('Page.navigate', { url: `file://${resolve(html)}` }, s);
        const ready = "document.readyState === 'complete' && document.images[0].complete && document.fonts.status === 'loaded'";
        for (let n = 0; ; n += 1) {
          const r = await cdp.send('Runtime.evaluate', { expression: ready, returnByValue: true }, s) as { result: { value?: boolean } };
          if (r.result.value === true) break;
          if (n === 100) throw new Error(`${html} never loaded`);
          await sleep(100);
        }
        const shotPng = await cdp.send('Page.captureScreenshot', { format: 'png' }, s) as { data: string };
        const png = Buffer.from(shotPng.data, 'base64');
        const got = header(png);
        if (got.width !== d.width || got.height !== d.height || got.alpha) {
          throw new Error(`${shot.file}: ${got.width} x ${got.height}${got.alpha ? ' with alpha' : ''}, not ${d.width} x ${d.height}`);
        }
        writeFileSync(join(OUT, d.dir, `${shot.file}.png`), png);
        console.log(`ios:shots: ${OUT}/${d.dir}/${shot.file}.png`);
      }
    }
  } finally {
    cdp.close();
    await chrome.close();
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const wanted = argv.filter((a) => !a.startsWith('--'));
  const shots = SHOTS.filter((s) => wanted.length === 0 || wanted.some((w) => s.file.startsWith(w)));
  if (shots.length === 0) throw new Error(`no shot ${wanted.join(', ')}: ${SHOTS.map((s) => s.file).join(', ')}`);
  for (const d of DISPLAYS) for (const dir of [d.dir, join('raw', d.dir)]) mkdirSync(join(OUT, dir), { recursive: true });
  if (!argv.includes('--no-capture')) {
    if (!argv.includes('--no-build') || !existsSync(APP)) build('shots');
    for (const d of DISPLAYS) {
      const udid = createDevice(d.model, 'shots');
      try {
        twelveHourClock(udid);
        simctl('status_bar', udid, 'override', '--time', '9:41', '--dataNetwork', 'wifi', '--wifiBars', '3',
          '--cellularBars', '4', '--batteryState', 'charged', '--batteryLevel', '100');
        uiWarmUp(udid, 'shots');
        for (const s of shots) {
          capture(udid, s, join(OUT, 'raw', d.dir));
          console.log(`ios:shots: captured ${d.dir}/${s.file}`);
        }
      } finally {
        quietly(() => simctl('shutdown', udid));
        quietly(() => simctl('delete', udid));
      }
    }
  }
  await compose(shots);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
