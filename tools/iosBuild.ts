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
//   npm run ios:build                 Debug, then Release and its check
//   npm run ios:build -- --release    Release and its check alone (CI's
//                                     apple job; ios-e2e builds the Debug)
//
// Needs Xcode and xcodegen.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/// Where the Release build goes, under ios/, so its .stringsdata can be read.
const RELEASE = 'build/release';

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
}
