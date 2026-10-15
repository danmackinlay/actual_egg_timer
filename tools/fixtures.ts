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
 *   fixtures/section.json      the egg in cross-section, a tick at a time, and
 *                              the egg the settings aim for
 *   fixtures/inputs.json       what a cook enters and a fresh install starts
 *                              from: bounds, defaults, both size-class tables,
 *                              the room, the egg-temperature buttons
 *   fixtures/slider.json       the doneness slider: snapping, the nearest
 *                              label, which words can be reached, the verdict
 *   fixtures/texture.json      the texture bands and the note's keys
 *   fixtures/boil.json         boil memory: a boil remembered, and estimated
 *   fixtures/sounds.json       the alarm sounds' timing
 *   fixtures/sousvide.json     the isothermal limit: no pan, no ramp, no
 *                              cooling, and an answer in hours
 *   fixtures/sousvideCopy.json which words say the sous-vide answer
 *   fixtures/calibration.json  the particle filter, particle by particle
 *   fixtures/record.json       the record (INFERENCE.md section 4): which records
 *                              a loader trusts, and a replayed log; the
 *                              calibration grid, and the filter's size and seed
 *   fixtures/decide.json       decision surfaces and the time chosen on one
 *   fixtures/outcome.json      the predicted outcome at the chosen time
 *   fixtures/certainty.json    how sure, in words: the word asked, the class,
 *                              the 90% interval and the time range
 *   fixtures/reach.json        the odds at every level, the verdict with them,
 *                              the answer at a level and with its time
 *                              decided, the shading, the advice
 *   fixtures/wording.json      which key each part of the screen says
 *   fixtures/copy.json         the catalogues rendered, and the plural rule of
 *                              every language at its edges
 *   fixtures/units.json        Metric and Imperial
 *   fixtures/format.json       numbers and times of day in every formatting
 *                              locale, and a pseudo-Czech catalogue in cs-CZ
 *   fixtures/probe.json        the probe reading
 *   fixtures/language.json     the switch into the English of 1750 and out
 *   fixtures/share.json        sharing's contract with the server: ids, the
 *                              number each egg is filed under, and what a
 *                              sender makes of the endpoint's answers
 *   fixtures/prior.json        a prior drawn from a population, and the
 *                              population files a reader refuses
 *   fixtures/running.json      a running cook: its egg and pot, its moves, its
 *                              plan, and the phase at every boundary
 *   fixtures/step.json         the running cook as one state machine: traces
 *                              of events, effects and the readout
 *
 * fixtures/population.json is NOT written here: it is the fit's output, the
 * population both apps draw from (tools/population.ts, fit/). prior.json
 * reads it.
 *
 * Each is JSON laid out one row per line (`fixtureLayout`,
 * tools/fixtureCompare.ts): a case, a step of a trace, a particle a line, so
 * that a diff names the rows that changed.
 *
 * Each fixture is made in a worker thread of its own, as many at once as the
 * machine has cores, the slowest first: a fixture module computes its
 * fixture when it is imported, and a module another imports for its
 * constants is one that computes nothing (tools/fixtures/shared.ts). Nothing
 * is written until every fixture is made, and then in the order below.
 */

import { availableParallelism } from 'node:os';
import { mkdirSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

import { fixtureLayout, replaceFile } from './fixtureCompare.js';

/** What a worker hands back: the fixture's file, and what the summary line
 *  says of it. */
interface Made { text: string; counts: string[] }

/** Each fixture by name, made by its module, and what the summary line counts
 *  of it, in the order the fixtures are written. */
const FIXTURES: Record<string, () => Promise<{ fixture: unknown; counts: string[] }>> = {
  core: async () => {
    const { coreFixture: f } = await import('./fixtures/core.js');
    return {
      fixture: f, counts: [
        `${f.sphere.seriesTheta.length} seriesTheta`,
        `${f.sphere.stepResponse.length} step samples`,
        `${f.sphere.rampResponse.length} ramp samples`,
        `${f.geometry.fromMass.length} geometry`,
        `${f.thermo.boilingPointAtAltitude.length} altitudes`,
      ],
    };
  },
  scenarios: async () => {
    const { scenariosFixture: f } = await import('./fixtures/scenarios.js');
    return { fixture: f, counts: [`${f.cases.length} scenarios`] };
  },
  section: async () => ({ fixture: (await import('./fixtures/section.js')).sectionFixture, counts: [] }),
  calibration: async () => {
    const { calibrationFixture: f } = await import('./fixtures/calibration.js');
    return {
      fixture: f, counts: [
        `${f.grid.logYolk.length} grid cells`,
        `${f.wordUpdates.length} calibration updates`,
        `${f.wordUpdates.filter((u) => u.white !== null).length} white answers`,
      ],
    };
  },
  inputs: async () => ({ fixture: (await import('./fixtures/inputs.js')).inputsFixture, counts: [] }),
  slider: async () => {
    const { sliderFixture: f } = await import('./fixtures/slider.js');
    return { fixture: f, counts: [`${f.cases.length} snap`, `${f.verdict.length} verdicts`] };
  },
  texture: async () => {
    const { textureFixture: f } = await import('./fixtures/texture.js');
    return { fixture: f, counts: [`${f.cases.length} textures`] };
  },
  boil: async () => ({ fixture: (await import('./fixtures/boil.js')).boilFixture, counts: [] }),
  sounds: async () => ({ fixture: (await import('./fixtures/sounds.js')).soundsFixture, counts: [] }),
  sousvide: async () => {
    const { sousvideFixture: f } = await import('./fixtures/sousvide.js');
    return { fixture: f, counts: [`${f.cases.length} sous-vide`] };
  },
  sousvideCopy: async () => {
    const { sousvideCopyFixture: f } = await import('./fixtures/sousvideCopy.js');
    return { fixture: f, counts: [`${f.duration.length + f.startPhrase.length} sous-vide copy`] };
  },
  record: async () => {
    const { recordFixture: f } = await import('./fixtures/record.js');
    return { fixture: f, counts: [`${f.cases.length} records`, `${f.replay.log.length} replayed eggs`] };
  },
  prior: async () => ({ fixture: (await import('./fixtures/population.js')).priorFixture, counts: [] }),
  decide: async () => {
    const { decideFixture: f } = await import('./fixtures/decide.js');
    return { fixture: f, counts: [`${f.specs.length} decision surfaces and ${f.cases.length} decisions`] };
  },
  outcome: async () => {
    const { outcomeFixture: f } = await import('./fixtures/outcome.js');
    return { fixture: f, counts: [`${f.cases.reduce((n, c) => n + c.at.length, 0)} outcomes`] };
  },
  certainty: async () => {
    const { certaintyFixture: f } = await import('./fixtures/certainty.js');
    return { fixture: f, counts: [`${f.spreads.length + f.cases.length} certainty readings`] };
  },
  reach: async () => {
    const { reachFixture: f } = await import('./fixtures/reach.js');
    const decided = f.profiles.reduce((n, p) => n + p.decided.length, f.owner.decided.length + f.neverSets.decided.length);
    return {
      fixture: f,
      counts: [`${f.profiles.length} odds profiles, ${decided} decided answers, ${f.lowOdds.length} warnings and ${f.advice.length} advice setups`],
    };
  },
  copy: async () => {
    const { copyFixture: f } = await import('./fixtures/copy.js');
    return {
      fixture: f,
      counts: [`${f.render.length} copy renders`, `${f.plural.length} plural rules`, `${f.probe.cases.length} copy probes`],
    };
  },
  format: async () => {
    const { formatFixture: f } = await import('./fixtures/format.js');
    return {
      fixture: f, counts: [
        `${f.numbers.length + f.counts.length + f.times.length} formatted numbers and times`,
        `${f.pseudo.cases.length} pseudo-Czech renders`,
      ],
    };
  },
  units: async () => {
    const { english } = await import('./fixtures/shared.js');
    const f = (await import('./fixtures/units.js')).unitsFixture(english);
    const trips = (f['measures'] as { roundTrip: unknown[] }[]).reduce((n, m) => n + m.roundTrip.length, 0);
    return { fixture: f, counts: [`${trips} unit round trips`] };
  },
  probe: async () => {
    const f = (await import('./fixtures/probe.js')).probeFixture();
    return {
      fixture: f,
      counts: [`${(f['updates'] as unknown[]).length} probe folds`, `${(f['solved'] as unknown[]).length} probe cooks`],
    };
  },
  language: async () => {
    const f = (await import('./fixtures/language.js')).languageFixture();
    return { fixture: f, counts: [`${(f['transitions'] as unknown[]).length} language moves`] };
  },
  share: async () => {
    const f = (await import('./fixtures/share.js')).shareFixture();
    return { fixture: f, counts: [`${f.replies.length} server answers`] };
  },
  wording: async () => ({ fixture: (await import('./fixtures/wording.js')).wordingFixture(), counts: [] }),
  running: async () => {
    const { runningFixture: f } = await import('./fixtures/running.js');
    return { fixture: f, counts: [`${f.setups.length} cook setups and ${f.moves.length} cook moves`] };
  },
  step: async () => {
    const { stepFixture: f } = await import('./fixtures/step.js');
    return {
      fixture: f,
      counts: [`${f.traces.length} cook traces of ${f.traces.reduce((n, t) => n + t.steps.length, 0)} steps`],
    };
  },
};

/** The order the summary line counts them in. */
const COUNTED = [
  'core', 'scenarios', 'calibration', 'slider', 'texture', 'sousvide', 'sousvideCopy', 'copy', 'format', 'units',
  'record', 'decide', 'outcome', 'certainty', 'reach', 'probe', 'language', 'share', 'running', 'step',
];

/** The slowest first, so that none is started last; the rest take moments. */
const SLOWEST = ['step', 'running', 'reach', 'record', 'certainty', 'outcome', 'decide', 'scenarios'];

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

/** The fixture `name`, made and laid out as its file. Every fixture's first
 *  key is `about`: what it pins and the core module that answers. The line
 *  saying where it came from is added here, the same for all. */
async function make(name: string): Promise<Made> {
  const { fixture, counts } = await FIXTURES[name]();
  const about = (fixture as { about?: unknown }).about;
  if (typeof about !== 'string') throw new Error(`fixtures/${name}.json has no about`);
  const stamped = { ...(fixture as object), about: `${about} Generated by tools/fixtures/${name}.ts (npm run fixtures): do not hand-edit.` };
  return { text: fixtureLayout(shareRepeatedParticles(stamped)), counts: counts };
}

/** `name` made in a worker of its own. */
function inWorker(name: string): Promise<Made> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: name });
    let made: Made | null = null;
    worker.on('message', (m: Made) => { made = m; });
    worker.on('error', (e: Error) => reject(new Error(`fixtures/${name}.json: ${e.stack ?? e.message}`)));
    worker.on('exit', (code) => {
      if (made !== null) resolve(made);
      else reject(new Error(`fixtures/${name}.json: its worker exited ${code} with nothing made`));
    });
  });
}

/** Every fixture, at most `width` at once, the slowest started first. */
async function makeAll(width: number): Promise<Map<string, Made>> {
  const names = Object.keys(FIXTURES);
  const queue = [...SLOWEST, ...names.filter((n) => !SLOWEST.includes(n))];
  const made = new Map<string, Made>();
  const lane = async (): Promise<void> => {
    for (let name = queue.shift(); name !== undefined; name = queue.shift()) made.set(name, await inWorker(name));
  };
  await Promise.all(Array.from({ length: Math.min(width, queue.length) }, lane));
  return made;
}

if (isMainThread) {
  const made = await makeAll(availableParallelism());
  mkdirSync('fixtures', { recursive: true });
  for (const name of Object.keys(FIXTURES)) replaceFile(`fixtures/${name}.json`, (made.get(name) as Made).text);
  const counts = COUNTED.flatMap((name) => (made.get(name) as Made).counts);
  console.log(`fixtures/*.json written: ${counts.join(', ')}`);
} else {
  parentPort?.postMessage(await make(workerData as string));
}
