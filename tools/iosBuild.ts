// `npm run ios:build`: the app built for the simulator, Debug and then
// Release, and no word in the Release build that the catalogue did not
// render.
//
// A string literal in one of SwiftUI's own text calls (`Text("Done")`,
// `Button("Done")`, `.accessibilityLabel("Done")`, `Text("Eggs: \(n)")`) is a
// `LocalizedStringKey`, which SwiftUI would look up in a strings table the
// app does not have, and show as it is. The Release build is compiled with
// `SWIFT_EMIT_LOC_STRINGS=YES`, so the compiler writes every such literal to
// a `.stringsdata` file beside each source file's object, wherever it is
// written: over several lines, through a name, in a `"""` literal. Any entry
// fails. The words are `tr`'s (`Words`, ios/EggTimerCore/Sources/
// EggTimerShared/Words.swift); what is not words is `Text(verbatim:)`. Only
// the Release build is read, as only it ships: a debug build's own screens
// (`#if DEBUG`) may say what they like.
//
// Then what the app finds in its own bundle, in the Release build's .app:
// Help's sources (help-sources.json) there and not empty, and each file an
// alarm can name there, in a format a notification plays and under 30 s, as
// `afinfo` reads it (`bundleProblems`).
//
//   npm run ios:build                 Debug, then Release and its checks
//   npm run ios:build -- --release    Release and its checks alone (CI's
//                                     apple job; ios-e2e builds the Debug)
//
// Needs Xcode and xcodegen.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { NOTIFICATION_SOUND_MAX_S } from '../src/ui/alarmSounds.ts';
import { ALARM_SOUNDS } from '../src/ui/settings.ts';

/// Where the Release build goes, under ios/, so its .stringsdata can be read.
const RELEASE = 'build/release';
/// The app it builds.
const RELEASE_APP = `ios/${RELEASE}/Build/Products/Release-iphonesimulator/Actual Egg Timer.app`;

/// One `.stringsdata` file's entries, as `source:line: "key"`: the literals
/// the compiler took for a strings table. Read from the file as the compiler
/// writes it, `{ source, tables: { <table>: [{ key, location }] } }`.
export function entries(json: string): string[] {
  const data = JSON.parse(json) as {
    source: string;
    tables: Record<string, { key: string; location?: { startingLine?: number } }[]>;
  };
  return Object.values(data.tables).flat()
    .map((e) => `${data.source}:${e.location?.startingLine ?? 0}: ${JSON.stringify(e.key)}`);
}

/// Every entry in the `.stringsdata` under `dir`, each once (a simulator
/// build compiles each file for two architectures), from sources that are
/// still there: a deleted file's last output is not read; and how many
/// files were read, so a build that wrote none is not taken for a clean one.
export function refused(dir: string): { files: number; entries: string[] } {
  const found = new Set<string>();
  let files = 0;
  const walk = (d: string): void => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const path = join(d, f.name);
      if (f.isDirectory()) walk(path);
      else if (f.name.endsWith('.stringsdata')) {
        const json = readFileSync(path, 'utf8');
        if (!existsSync((JSON.parse(json) as { source: string }).source)) continue;
        files++;
        for (const e of entries(json)) found.add(e);
      }
    }
  };
  if (existsSync(dir)) walk(dir);
  return { files, entries: [...found].sort() };
}

/// The formats the system plays a notification's sound in, as afinfo names
/// them (UNNotificationSound's documentation: linear PCM, IMA4, µ-law,
/// a-law); a file it cannot find, cannot play, or of 30 s or more it
/// replaces with its default sound.
const NOTIFICATION_FORMATS = ['lpcm', 'ima4', 'ulaw', 'alaw'];

/// Every file an alarm can name (`AlarmSoundChoice.file`): one for each
/// sound and moment.
export const SOUND_FILES = ALARM_SOUNDS.flatMap((s) => ['pull', 'cooled'].map((m) => `alarm-${s}-${m}.caf`));

/// What `afinfo` says of an audio file: its format's code, linear PCM's
/// (which it names by its samples, `Int16`, `Float32`) as `lpcm`; and its
/// length, s. Null for what it does not say.
export function afinfoRead(text: string): { format: string | null; seconds: number | null } {
  const data = /Data format:[^\n]*?Hz, ([^\n]*)/.exec(text)?.[1]?.trim() ?? null;
  const format = data === null ? null : /^U?(Int|Float)\d+/.test(data) ? 'lpcm' : data.split(/[\s(]/)[0]!;
  const seconds = /estimated duration: ([\d.]+) sec/.exec(text)?.[1];
  return { format, seconds: seconds === undefined ? null : Number(seconds) };
}

/// What is wrong with the app's own files in the .app at `app`, a line
/// each; none if nothing. `afinfo` gives a file's account by `afinfo`, null
/// for one it cannot read.
export function bundleProblems(app: string, afinfo: (path: string) => string | null): string[] {
  const out: string[] = [];
  const sources = join(app, 'help-sources.json');
  if (!existsSync(sources) || statSync(sources).size === 0) {
    out.push('help-sources.json is not in the bundle, or is empty (ios/project.yml)');
  }
  for (const name of SOUND_FILES) {
    const path = join(app, name);
    if (!existsSync(path)) {
      out.push(`${name} is not in the bundle (ios/project.yml, ios/App/Sounds)`);
      continue;
    }
    const text = afinfo(path);
    const { format, seconds } = text === null ? { format: null, seconds: null } : afinfoRead(text);
    if (format === null || !NOTIFICATION_FORMATS.includes(format)) {
      out.push(`${name}: format ${format ?? 'unreadable'}, not one a notification plays (${NOTIFICATION_FORMATS.join(', ')})`);
    }
    if (seconds === null || !(seconds > 0 && seconds < NOTIFICATION_SOUND_MAX_S)) {
      out.push(`${name}: ${seconds ?? 'no length'} s, not under ${NOTIFICATION_SOUND_MAX_S}`);
    }
  }
  return out;
}

/// `afinfo`'s account of a file, or null if it cannot read it.
function afinfo(path: string): string | null {
  try {
    return execFileSync('afinfo', [path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

function xcodebuild(configuration: string, extra: string[]): void {
  console.log(`ios:build: ${configuration}`);
  execFileSync('xcodebuild', [
    '-project', 'ActualEggTimer.xcodeproj', '-scheme', 'ActualEggTimer', '-configuration', configuration,
    '-destination', 'generic/platform=iOS Simulator', 'CODE_SIGNING_ALLOWED=NO', '-quiet', ...extra, 'build',
  ], { cwd: 'ios', stdio: 'inherit' });
}

if (process.argv[1]?.endsWith('iosBuild.ts')) {
  execFileSync('xcodegen', ['--quiet'], { cwd: 'ios', stdio: 'inherit' });
  if (!process.argv.includes('--release')) xcodebuild('Debug', []);
  xcodebuild('Release', ['-derivedDataPath', RELEASE, 'SWIFT_EMIT_LOC_STRINGS=YES']);
  const { files, entries: failures } = refused(`ios/${RELEASE}/Build/Intermediates.noindex`);
  if (files === 0) throw new Error(`no .stringsdata under ios/${RELEASE}: SWIFT_EMIT_LOC_STRINGS wrote nothing to read`);
  if (failures.length > 0) {
    console.log(`${failures.length} literals in SwiftUI's text calls, which no catalogue renders: give each a key in copy/en.json and say it with tr, or Text(verbatim:) for what is not words\n${failures.join('\n')}`);
    process.exit(1);
  }
  console.log(`ios:build: ${files} .stringsdata files read; no literal in a SwiftUI text call`);
  const problems = bundleProblems(RELEASE_APP, afinfo);
  if (problems.length > 0) {
    console.log(`ios:build: in ${RELEASE_APP}:\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log(`ios:build: help-sources.json and ${SOUND_FILES.length} alarm sounds in the bundle, each one a notification plays`);
}
