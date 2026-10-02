/**
 * Golden fixtures: the TypeScript core's answers, written out so another
 * implementation can be held to them.
 *
 * This is the contract for the Swift port (`ios/`). The rule is that the
 * fixtures are generated ONLY from this implementation, and the port never
 * regenerates them to make itself pass - if a number here is wrong, it is wrong
 * in `src/core/` first, and `npm test` should be what catches it.
 *
 * Run: npm run fixtures
 *
 * One file per part of the core, each held by a Swift suite of the same name
 * and built by the module of the same name in tools/fixtures/ (what more than
 * one of them uses is in tools/fixtures/shared.ts):
 *
 *   fixtures/core.json         pure functions: the sphere, geometry, boiling
 *   fixtures/scenarios.json    whole cooks, solved end to end
 *   fixtures/section.json      the egg in cross-section, a tick at a time
 *   fixtures/policy.json       the decisions above the physics - snapping, the
 *                              refusal verdict, texture bands, the calibration
 *                              grid's geometry, the bounds and defaults, both
 *                              size-class tables, the phase rule
 *   fixtures/sousvide.json     the isothermal limit: no pan, no ramp, no
 *                              cooling, and an answer in hours
 *   fixtures/sousvideCopy.json which words say the sous-vide answer
 *   fixtures/calibration.json  the particle filter, particle by particle
 *   fixtures/record.json       the record (INFERENCE.md section 4): which records
 *                              a loader trusts, and a replayed log
 *   fixtures/decide.json       decision surfaces and the time chosen on one
 *   fixtures/outcome.json      the predicted outcome at the chosen time
 *   fixtures/reach.json        the odds at every level, the verdict with them,
 *                              the answer at a level, the shading, the advice
 *   fixtures/wording.json      which key each part of the screen says
 *   fixtures/copy.json         the catalogues rendered, and the plural rule of
 *                              every language at its edges
 *   fixtures/units.json        Metric and Imperial
 *   fixtures/format.json       numbers and times of day in every formatting
 *                              locale, and a pseudo-Czech catalogue in cs-CZ
 *   fixtures/probe.json        the probe reading
 *   fixtures/language.json     the switch into the English of 1750 and out
 */

import { mkdirSync, writeFileSync } from 'node:fs';

import { english } from './fixtures/shared.js';
import { coreFixture } from './fixtures/core.js';
import { scenariosFixture } from './fixtures/scenarios.js';
import { sectionFixture } from './fixtures/section.js';
import { calibrationFixture } from './fixtures/calibration.js';
import { policyFixture } from './fixtures/policy.js';
import { sousvideFixture } from './fixtures/sousvide.js';
import { sousvideCopyFixture } from './fixtures/sousvideCopy.js';
import { recordFixture } from './fixtures/record.js';
import { decideFixture } from './fixtures/decide.js';
import { outcomeFixture } from './fixtures/outcome.js';
import { reachFixture } from './fixtures/reach.js';
import { copyFixture } from './fixtures/copy.js';
import { formatFixture } from './fixtures/format.js';
import { unitsFixture } from './fixtures/units.js';
import { probeFixture } from './fixtures/probe.js';
import { languageFixture } from './fixtures/language.js';
import { wordingFixture } from './fixtures/wording.js';

const unitsJson = unitsFixture(english);
const probeJson = probeFixture();
const languageJson = languageFixture();

mkdirSync('fixtures', { recursive: true });
const written: Record<string, unknown> = {
  core: coreFixture,
  scenarios: scenariosFixture,
  section: sectionFixture,
  calibration: calibrationFixture,
  policy: policyFixture,
  sousvide: sousvideFixture,
  sousvideCopy: sousvideCopyFixture,
  record: recordFixture,
  decide: decideFixture,
  outcome: outcomeFixture,
  reach: reachFixture,
  copy: copyFixture,
  format: formatFixture,
  units: unitsJson,
  probe: probeJson,
  language: languageJson,
  wording: wordingFixture(),
};
/**
 * A particle set that repeats one earlier in the same file - an update that
 * reweighted without resampling keeps its particles - is written once: the
 * repeat is `{ "sameAs": "<dotted path>" }`, the path of the first, with array
 * indices as numbers (`updates.2.after.particles`). Fixtures.swift resolves it
 * on load, so no reader sees it.
 */
function shareRepeatedParticles(root: unknown): unknown {
  const seen = new Map<string, string>();
  const walk = (node: unknown, path: string[]): unknown => {
    if (Array.isArray(node)) return node.map((v, i) => walk(v, [...path, String(i)]));
    if (node === null || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      const at = [...path, key];
      if (key === 'particles' && Array.isArray(value) && value.length > 1) {
        const text = JSON.stringify(value);
        const first = seen.get(text);
        if (first !== undefined) {
          out[key] = { sameAs: first };
          continue;
        }
        seen.set(text, at.join('.'));
      }
      out[key] = walk(value, at);
    }
    return out;
  };
  return walk(root, []);
}

/** Two-space JSON with each particle on one line: six numbers a particle,
 *  thousands of particles, would otherwise be most of the fixtures' lines. */
function fixtureText(fixture: unknown): string {
  return JSON.stringify(shareRepeatedParticles(fixture), null, 2)
    .replace(/\{\n\s*"alpha_m2s": [^\n]*(?:,\n\s*"[A-Za-z0-9_]+": [^\n{}[\]]*)*\n\s*\}/g,
      (block) => block.replace(/\n\s*/g, ' '));
}

// Every fixture's first key is `about`: what it pins and the core module that
// answers. The line saying where it came from is added here, the same for all.
for (const [name, fixture] of Object.entries(written)) {
  const about = (fixture as { about?: unknown }).about;
  if (typeof about !== 'string') throw new Error(`fixtures/${name}.json has no about`);
  const stamped = { ...(fixture as object), about: `${about} Generated by tools/fixtures/${name}.ts (npm run fixtures): do not hand-edit.` };
  writeFileSync(`fixtures/${name}.json`, `${fixtureText(stamped)}\n`);
}

const counts = [
  `${coreFixture.sphere.seriesTheta.length} seriesTheta`,
  `${coreFixture.sphere.stepResponse.length} step samples`,
  `${coreFixture.sphere.rampResponse.length} ramp samples`,
  `${coreFixture.geometry.fromMass.length} geometry`,
  `${coreFixture.thermo.boilingPointAtAltitude.length} altitudes`,
  `${scenariosFixture.cases.length} scenarios`,
  `${calibrationFixture.grid.logYolk.length} grid cells`,
  `${calibrationFixture.updates.length} calibration updates`,
  `${calibrationFixture.updates.filter((u) => u.white !== null).length} white answers`,
  `${policyFixture.slider.cases.length} snap`,
  `${policyFixture.verdict.length} verdicts`,
  `${policyFixture.texture.length} textures`,
  `${sousvideFixture.cases.length} sous-vide`,
  `${sousvideCopyFixture.duration.length + sousvideCopyFixture.startPhrase.length} sous-vide copy`,
  `${copyFixture.render.length} copy renders`,
  `${copyFixture.plural.length} plural rules`,
  `${copyFixture.probe.cases.length} copy probes`,
  `${formatFixture.numbers.length + formatFixture.counts.length + formatFixture.times.length} formatted numbers and times`,
  `${formatFixture.pseudo.cases.length} pseudo-Czech renders`,
  `${(unitsJson['measures'] as { roundTrip: unknown[] }[]).reduce((n, m) => n + m.roundTrip.length, 0)} unit round trips`,
  `${recordFixture.cases.length} records`,
  `${recordFixture.replay.log.length} replayed eggs`,
  `${decideFixture.specs.length} decision surfaces and ${decideFixture.cases.length} decisions`,
  `${outcomeFixture.cases.reduce((n, c) => n + c.at.length, 0)} outcomes`,
  `${reachFixture.profiles.length} odds profiles, ${reachFixture.verdicts.length} verdicts with odds and ${reachFixture.advice.length} advice setups`,
  `${(probeJson['updates'] as unknown[]).length} probe folds`,
  `${(probeJson['solved'] as unknown[]).length} probe cooks`,
  `${(languageJson['transitions'] as unknown[]).length} language moves`,
];
console.log(`fixtures/*.json written: ${counts.join(', ')}`);
