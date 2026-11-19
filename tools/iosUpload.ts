// `npm run ios:upload`: send the archive `npm run ios:archive` made to App
// Store Connect, with ios/ExportOptions.plist (which keeps Xcode from
// rewriting the build number). If xcodebuild cannot finish, the archive opens
// in Xcode's Organizer instead, with the clicks to make there, and the reason
// it failed read from its output.
//
// xcodebuild runs with the system's default PATH (`getconf PATH`), the one
// Xcode's own window runs with, not the shell's. Exporting copies with
// Apple's /usr/bin/rsync, which starts its other half by name; a shell PATH
// with Homebrew's rsync ahead of it fails the export with "Copy failed".
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const archive = 'ios/build/ActualEggTimer.xcarchive';
const info = `${archive}/Products/Applications/Actual Egg Timer.app/Info.plist`;

if (!existsSync(info)) {
  throw new Error(`${archive} is missing: run npm run ios:archive first`);
}
const read = (key: string): string => execFileSync('plutil', ['-extract', key, 'raw', info], { encoding: 'utf8' }).trim();
const label = `${read('CFBundleShortVersionString')} (${read('CFBundleVersion')})`;
console.log(`ios:upload: ${label}`);

const systemPath = execFileSync('getconf', ['PATH'], { encoding: 'utf8' }).trim();

/** Run xcodebuild, showing its output as it comes, and return its exit code
 *  and everything it said. */
function xcodebuild(args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn('xcodebuild', args, { cwd: 'ios', env: { ...process.env, PATH: systemPath } });
    let output = '';
    child.stdout.on('data', (d: Buffer) => { output += d; process.stdout.write(d); });
    child.stderr.on('data', (d: Buffer) => { output += d; process.stderr.write(d); });
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

/** What to do about a failed export, from what xcodebuild said. */
function advice(output: string): string {
  if (/Copy failed/.test(output)) {
    return `It failed copying the app ("Copy failed"), not signing in. Its distribution log
($TMPDIR/ActualEggTimer_*.xcdistributionlogs/IDEDistributionPipeline.log) says
why; "--extended-attributes: unknown option" is a second rsync on the PATH
that this script's system PATH should have kept out (ios/RELEASING.md).`;
  }
  if (/No Accounts|Failed to Use Accounts|Unable to authenticate/.test(output)) {
    return `xcodebuild could not use an Apple Account. To make the script work next time:
Xcode, Settings, Apple Accounts, and sign in again.`;
  }
  return 'The reason is in the output above.';
}

const { code, output } = await xcodebuild([
  '-exportArchive', '-archivePath', 'build/ActualEggTimer.xcarchive',
  '-exportOptionsPlist', 'ExportOptions.plist', '-exportPath', 'build/export',
  '-allowProvisioningUpdates',
]);
if (code === 0) {
  console.log(`ios:upload: ${label} sent; it shows in App Store Connect after processing, usually 5-30 minutes`);
} else {
  console.log(`
ios:upload: xcodebuild could not upload ${label}. Opening it in Xcode's Organizer.
There: select the archive, then Distribute App, then App Store Connect, then
Upload. On the options page, UNTICK "Manage version and build number".
${advice(output)}`);
  execFileSync('open', [archive]);
}
