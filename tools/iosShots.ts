// `npm run ios:shots`: the App Store's screenshots, captioned, in English
// (Australia), at the two sizes App Store Connect takes for an iPhone: the
// iPhone 17 Pro's 1206 x 2622 (required) and the 17 Pro Max's 1320 x 2868.
//
// Each shot is a Debug build on a simulator of the tool's own, driven as
// `npm run ios:e2e` drives it (tools/iosHarness.ts): the clock frozen and
// stepped to the moment shown, the taps by launch argument, the status bar
// at 9:41 and the cook started at 9:38. The device's screen is then set
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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { Cdp, launchChrome, sleep } from './chrome.ts';
import { APP, Run, build, createDevice, is, quietly, settingsArg, simctl, warmUp } from './iosHarness.ts';

const OUT = 'ios/appstore/shots';
const CAPTIONS = 'ios/appstore/captions.en-AU.json';

/// The displays App Store Connect asks for, each an iPhone the simulator runs.
const DISPLAYS = [
  { model: 'iPhone 17 Pro', dir: '6.3in-1206x2622', width: 1206, height: 2622 },
  { model: 'iPhone 17 Pro Max', dir: '6.9in-1320x2868', width: 1320, height: 2868 },
];

/// The egg every shot cooks unless it says otherwise: a 60 g egg weighed,
/// from the fridge, into boiling water, cooled in ice, asked soft.
const EGG = { sizeIndex: -1, weighedMassG: 60, startTempMode: 'fridge', startMode: 'hot', cooling: 'ice', doneness: 0.22 };

/// The settings a shot changes from the egg's, and its launch arguments.
interface Given { over?: Record<string, unknown>; args?: string[] }
/// A cook's deadlines, epoch s, cook time.
interface Plan { start: number; pull: number; cooled: number }
/// One shot: its file's name, its scheme, and how the app is brought to it.
interface Shot { file: string; dark?: boolean; go: (run: Run) => Promise<void> }

/// Launch with the egg, and wait until the time is worked out and drawn;
/// then step to the launch's moment, which waits for the app to be idle (a
/// clock reads a step only once it listens, so never one written at launch).
async function launched(run: Run, { over = {}, args = [] }: Given = {}): Promise<void> {
  run.launch([...settingsArg({ ...EGG, ...over }), ...args]);
  await run.until(is('frame', (e) => e.big !== '--:--'), { from: run.launched, what: 'the time worked out' });
  await run.tick();
}

/// Wait for the cook to reach `phase` after line `from`, and to settle there.
async function reached(run: Run, phase: string, from: number): Promise<void> {
  const at = await run.until(is('phase', (e) => e.phase === phase), { from, what: `phase ${phase}` });
  await run.settled(at.i);
}

/// A cook: Eggs in a second after the launch; with `out`, the eggs out two
/// seconds into the pull; then the clock stepped to `at(plan)`.
async function cook(run: Run, at: (p: Plan) => number, { over = {}, args = [], out = false }: Given & { out?: boolean } = {}): Promise<void> {
  await launched(run, { over, args: [...args, '-uiDo', out ? 'eggsIn@launch+1,out@pull+2' : 'eggsIn@launch+1'] });
  const start = run.t0 + 1;
  await reached(run, 'COOKING', await run.step(start));
  const last = (): Plan => {
    const p = run.lines().filter(is('plan')).at(-1);
    if (!p?.cooled) throw new Error('no plan with a cooling end');
    return { start, pull: p.pull, cooled: p.cooled };
  };
  if (out) await reached(run, 'COOLING', await run.step(last().pull + 2));
  await run.step(at(last()));
}

const SHOTS: Shot[] = [
  { file: '01-time', go: (run) => launched(run) },
  { file: '02-setting', go: (run) => cook(run, (p) => p.start + 200) },
  { file: '03-heat', dark: true, go: (run) => cook(run, (p) => p.start + 200, { over: { eggView: 'heat' } }) },
  { file: '04-done', go: (run) => cook(run, (p) => p.cooled + 1, { out: true, args: ['-uiScreen', 'end'] }) },
  { file: '05-eggcup', go: (run) => cook(run, (p) => p.cooled - 75, { out: true, over: { cooling: 'eggCup' } }) },
];

/// Today at 9:38, local, epoch s: where each shot's clock starts, so a time
/// on screen agrees with the status bar's 9:41.
const START = new Date().setHours(9, 38, 0, 0) / 1000;

/// The device's screen, as the simulator draws it, at `path`: taken again
/// until two in a row are the same, so no system animation is caught midway.
async function capture(udid: string, shot: Shot, path: string): Promise<void> {
  simctl('ui', udid, 'appearance', shot.dark ? 'dark' : 'light');
  const run = new Run(shot.file, udid);
  run.t0 = run.at = START;
  run.install();
  try {
    await shot.go(run);
    let last = '';
    for (let n = 0; n < 20; n += 1) {
      await sleep(500);
      simctl('io', udid, 'screenshot', '--mask', 'ignored', path);
      const now = readFileSync(path).toString('base64');
      if (now === last) return;
      last = now;
    }
    throw new Error(`${shot.file}: the screen never still`);
  } finally {
    run.terminate();
  }
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
        simctl('status_bar', udid, 'override', '--time', '9:41', '--dataNetwork', 'wifi', '--wifiBars', '3',
          '--cellularBars', '4', '--batteryState', 'charged', '--batteryLevel', '100');
        await warmUp(udid, 'shots');
        for (const s of shots) {
          await capture(udid, s, join(OUT, 'raw', d.dir, `${s.file}.png`));
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
