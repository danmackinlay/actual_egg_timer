/**
 * fixtures/prior.json: drawing a prior from a population
 * (src/core/population.ts). The published population (fixtures/population.json,
 * whatever the fit last wrote), the literature's, and one shifted every way a
 * fit could move it, each read, its centre, and the first particles of a
 * prior drawn from it; and the files a reader must refuse, among them a fit
 * whose diagnostics do not vouch for it.
 */

import { readFileSync } from 'node:fs';
import { LITERATURE_POPULATION, type Population, createPrior } from '../../src/core/infer.ts';
import { FORCED_ID_SUFFIX, parsePopulation, priorStart } from '../../src/core/population.ts';
import { calibrationDoneness, calibrationParams, freshCalibration } from '../../src/core/record.ts';
import { particleRows } from './shared.ts';

const PRIOR_COUNT = 64;
const PRIOR_SEED = 20261002;
const ROWS = 8;

const published = JSON.parse(readFileSync('fixtures/population.json', 'utf8')) as unknown;

/** Every spread moved: what a fit of real eggs might publish. */
const SHIFTED: Population = {
  id: 'test-shifted',
  alpha_m2s: { median: 1.81e-7, logSd: 0.071 },
  logDoseOffset: { mean: 0.0, sd: 0.13 },
  noise: { median: 0.17, logSd: 0.42 },
  whiteOffset: { mean: 0.21, sd: 0.33 },
  whiteFirmGap: { median: 0.97, logSd: 0.31 },
};

/** What the fit writes of a sampler that passed its checks, and of one that
 *  failed and was forced (fit/eggfit/__main__.py's gate), less the rows. */
const PASSED = { ok: true, forced: false, failures: [] };
const FORCED = { ok: false, forced: true, failures: ['3 divergent transitions'] };

function fileOf(p: Population, diagnostics: object | null = null): Record<string, unknown> {
  const { id, ...prior } = p;
  return { id: id, diagnostics: diagnostics, prior: prior };
}

function drawn(name: string, raw: unknown) {
  const pop = parsePopulation(raw);
  if (pop === null) throw new Error(`${name} does not read`);
  const c = freshCalibration(PRIOR_COUNT, PRIOR_SEED, pop);
  return {
    name: name,
    file: raw,
    population: pop,
    start: priorStart(pop),
    params: calibrationParams(c),
    whiteDoseAtSoft: calibrationDoneness(c, 0.22).whiteDose_min,
    rng: c.posterior.rng,
    particles: particleRows(createPrior(PRIOR_COUNT, PRIOR_SEED, pop)).slice(0, ROWS),
  };
}

type Mutation = (f: Record<string, unknown>) => void;
const prior = (f: Record<string, unknown>) => f['prior'] as Record<string, Record<string, unknown>>;
const diagnostics = (f: Record<string, unknown>) => f['diagnostics'] as Record<string, unknown>;
const REFUSED: { why: string; mutate: Mutation }[] = [
  { why: 'a fit with no diagnostics', mutate: (f) => { delete f['diagnostics']; } },
  { why: 'a fit whose diagnostics are null', mutate: (f) => { f['diagnostics'] = null; } },
  { why: 'diagnostics that are not an object', mutate: (f) => { f['diagnostics'] = true; } },
  { why: 'a sampler that failed, not forced', mutate: (f) => { diagnostics(f)['ok'] = false; } },
  { why: 'a sampler that failed, forced, under an id that does not say so', mutate: (f) => { f['diagnostics'] = { ...FORCED }; } },
  { why: 'a sampler that passed and was forced', mutate: (f) => { diagnostics(f)['forced'] = true; } },
  { why: 'diagnostics with no forced', mutate: (f) => { delete diagnostics(f)['forced']; } },
  { why: 'ok as a string', mutate: (f) => { diagnostics(f)['ok'] = 'true'; } },
  { why: 'no diagnostics under the literature\'s id with other numbers', mutate: (f) => { f['id'] = LITERATURE_POPULATION.id; f['diagnostics'] = null; } },
  { why: 'no id', mutate: (f) => { delete f['id']; } },
  { why: 'an empty id', mutate: (f) => { f['id'] = ''; } },
  { why: 'no prior', mutate: (f) => { delete f['prior']; } },
  { why: 'no noise', mutate: (f) => { delete prior(f)['noise']; } },
  { why: 'a zero median', mutate: (f) => { prior(f)['alpha_m2s']['median'] = 0; } },
  { why: 'a negative median', mutate: (f) => { prior(f)['whiteFirmGap']['median'] = -1; } },
  { why: 'a zero spread', mutate: (f) => { prior(f)['whiteFirmGap']['logSd'] = 0; } },
  { why: 'a zero sd', mutate: (f) => { prior(f)['whiteOffset']['sd'] = 0; } },
  { why: 'a mean as a string', mutate: (f) => { prior(f)['logDoseOffset']['mean'] = '0'; } },
  { why: 'a lognormal written as a normal', mutate: (f) => { prior(f)['noise'] = { mean: 0.2, sd: 0.5 }; } },
];

export const priorFixture = {
  about: 'A prior drawn from a population - the published one (fixtures/population.json), the literature\'s, one shifted every way and the literature\'s as a file from before 0.5 wrote it - and the population files a reader refuses: one it cannot trust, or a fit its diagnostics do not vouch for. src/core/population.ts.',
  count: PRIOR_COUNT,
  seed: PRIOR_SEED,
  populations: [
    drawn('published', published),
    drawn('literature', fileOf(LITERATURE_POPULATION)),
    drawn('shifted', { ...fileOf(SHIFTED, PASSED), fitted: '2026-11-01', covariance: [[1, 0], [0, 1]] }),
    // Forced: read, and its id says so in every record drawn from it.
    drawn('forced', fileOf({ ...SHIFTED, id: `fit-2026-11-01${FORCED_ID_SUFFIX}` }, FORCED)),
    // A file from before 0.5, with a spread for the carryover, which is not a
    // particle: read, and the spread ignored.
    // It has no diagnostics, which the literature's numbers need none of.
    drawn('before 0.5', { id: LITERATURE_POPULATION.id, prior: { ...fileOf(LITERATURE_POPULATION)['prior'] as object, tauAirScale: { median: 1, logSd: 0.35 } } }),
  ],
  refused: REFUSED.map((r) => {
    const f = JSON.parse(JSON.stringify(fileOf(SHIFTED, PASSED))) as Record<string, unknown>;
    r.mutate(f);
    if (parsePopulation(f) !== null) throw new Error(`${r.why}: read`);
    return { why: r.why, file: f };
  }),
};
