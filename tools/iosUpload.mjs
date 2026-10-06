// `npm run ios:upload`: send the archive `npm run ios:archive` made to App
// Store Connect, with ios/ExportOptions.plist (which keeps Xcode from
// rewriting the build number). If xcodebuild cannot use an Apple Account
// ("No Accounts", "Failed to Use Accounts"), the archive opens in Xcode's
// Organizer instead, with the two clicks to make there.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const archive = 'ios/build/ActualEggTimer.xcarchive';
const info = `${archive}/Products/Applications/Actual Egg Timer.app/Info.plist`;

if (!existsSync(info)) {
  throw new Error(`${archive} is missing: run npm run ios:archive first`);
}
const read = (key) => execFileSync('plutil', ['-extract', key, 'raw', info], { encoding: 'utf8' }).trim();
const label = `${read('CFBundleShortVersionString')} (${read('CFBundleVersion')})`;
console.log(`ios:upload: ${label}`);

try {
  execFileSync('xcodebuild', [
    '-exportArchive', '-archivePath', 'build/ActualEggTimer.xcarchive',
    '-exportOptionsPlist', 'ExportOptions.plist', '-exportPath', 'build/export',
    '-allowProvisioningUpdates',
  ], { cwd: 'ios', stdio: 'inherit' });
  console.log(`ios:upload: ${label} sent; it shows in App Store Connect after processing, usually 5-30 minutes`);
} catch {
  console.log(`
ios:upload: xcodebuild could not upload ${label}. Opening it in Xcode's Organizer.
There: select the archive, then Distribute App, then App Store Connect, then
Upload. On the options page, UNTICK "Manage version and build number".
(To make the script work next time: Xcode, Settings, Accounts, and sign in again.)`);
  execFileSync('open', [archive]);
}
