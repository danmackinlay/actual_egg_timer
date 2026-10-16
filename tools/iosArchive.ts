// `npm run ios:archive`: a Release archive for TestFlight, with the build
// number bumped first, so no upload is refused for a number already used
// (App Store Connect says so only after the whole upload).
//
// 1. CURRENT_PROJECT_VERSION in ios/project.yml goes up by one, and that one
//    line is committed (staged by name), so the number on record is the one
//    uploaded. Run it from a clean project.yml.
// 2. xcodegen, then xcodebuild archive (Release, generic iOS device,
//    -allowProvisioningUpdates) into ios/build/ActualEggTimer.xcarchive.
// 3. Checks on the archive, not the source: the build number is the new one,
//    the alarm's time-sensitive entitlement survived signing (if the App
//    ID lacks the capability the entitlement is dropped, not refused), and
//    the bundled population reads (parsePopulation: a fit needs its
//    diagnostics, a forced one an id that says so), since the app would
//    silently draw from the literature's instead.
//
// Uploading is separate: `npm run ios:upload`.
import { type StdioOptions, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { parsePopulation } from '../src/core/population.ts';

const yml = 'ios/project.yml';
const archive = 'build/ActualEggTimer.xcarchive';
const app = `ios/${archive}/Products/Applications/Actual Egg Timer.app`;

/** What a step here may set: where it runs, and where its output goes. */
interface StepOptions { cwd?: string; stdio?: StdioOptions }
const run = (cmd: string, args: string[], opts: StepOptions = {}): void => {
  execFileSync(cmd, args, { stdio: 'inherit', ...opts });
};
const out = (cmd: string, args: string[], opts: StepOptions = {}): string =>
  execFileSync(cmd, args, { encoding: 'utf8', ...opts }).trim();

if (out('git', ['status', '--porcelain', '--', yml]) !== '') {
  throw new Error(`${yml} has uncommitted changes; commit or discard them first`);
}

const text = readFileSync(yml, 'utf8');
const found = text.match(/^(\s*CURRENT_PROJECT_VERSION:\s*")(\d+)(")/m);
if (found === null) throw new Error(`${yml}: CURRENT_PROJECT_VERSION not found`);
const build = Number(found[2]) + 1;
writeFileSync(yml, text.replace(found[0], `${found[1]}${build}${found[3]}`));
const version = out('node', ['-p', "require('./package.json').version"]);
console.log(`ios:archive: ${version}, build ${build}`);

// A failed archive leaves project.yml as it was, so the number is not spent.
try {
run('xcodegen', ['--quiet'], { cwd: 'ios' });
run('xcodebuild', [
  '-project', 'ActualEggTimer.xcodeproj', '-scheme', 'ActualEggTimer',
  '-destination', 'generic/platform=iOS', '-configuration', 'Release',
  '-archivePath', archive, '-allowProvisioningUpdates', '-quiet', 'archive',
], { cwd: 'ios' });

const archived = out('plutil', ['-extract', 'CFBundleVersion', 'raw', `${app}/Info.plist`]);
if (archived !== String(build)) throw new Error(`the archive says build ${archived}, not ${build}`);
const entitlements = out('codesign', ['-d', '--entitlements', '-', '--xml', app], { stdio: ['ignore', 'pipe', 'ignore'] });
if (!entitlements.includes('time-sensitive')) {
  throw new Error('the time-sensitive entitlement is missing: tick Time Sensitive Notifications on the App ID');
}
const population = JSON.parse(readFileSync(`${app}/population.json`, 'utf8'));
const drawn = parsePopulation(population);
if (drawn === null) throw new Error('the archive\'s population.json does not read (src/core/population.ts)');
if (population.diagnostics?.forced === true) {
  console.warn(`ios:archive: the population ${drawn.id} was forced: its sampler failed its checks`);
}
} catch (error) {
  writeFileSync(yml, text);
  throw error;
}

run('git', ['add', yml]);
run('git', ['commit', '-q', '-m', `iOS build ${build}, archived for TestFlight`]);
console.log(`ios:archive: ios/${archive} is ${version} (${build}), signed with the time-sensitive entitlement; ${yml} committed`);
