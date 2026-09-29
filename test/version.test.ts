/**
 * One version number, written in package.json, its lockfile and the iOS app's
 * MARKETING_VERSION (ios/project.yml); the web's APP_VERSION is held to it in
 * record.test.ts. They drift apart silently, so they are held together here.
 * The iOS team ID is written twice, in ios/project.yml and
 * ios/ExportOptions.plist, and is held the same way.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

function match(file: string, re: RegExp): string {
  const m = readFileSync(file, 'utf8').match(re);
  assert.ok(m !== null, `${file}: ${re} not found`);
  return m[1];
}

test('1. the version is one number: package.json, its lockfile and iOS', () => {
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as { version: string };
  assert.equal(lock.version, pkg.version, 'package-lock.json');
  // iOS takes integers only, so it carries the version without its
  // pre-release tag: 0.3.0-alpha.1 is 0.3.0 on the phone.
  assert.equal(match('ios/project.yml', /MARKETING_VERSION:\s*"([^"]+)"/), pkg.version.replace(/-.*$/, ''), 'ios/project.yml');
});

test('2. the iOS team ID is the same for building and for exporting', () => {
  assert.equal(
    match('ios/ExportOptions.plist', /<key>teamID<\/key>\s*<string>([^<]+)<\/string>/),
    match('ios/project.yml', /DEVELOPMENT_TEAM:\s*(\S+)/),
  );
});
