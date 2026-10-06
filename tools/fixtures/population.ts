/**
 * fixtures/prior.json: drawing a prior from a population (E7;
 * src/core/population.ts). The published population (fixtures/population.json,
 * whatever the fit last wrote), the literature's, and one shifted every way a
 * fit could move it, each read, its centre, and the first particles of a
 * prior drawn from it; and the files a reader must refuse.
 */

import { readFileSync } from 'node:fs';
import { LITERATURE_POPULATION, Population, createPrior } from '../../src/core/infer.js';
import { parsePopulation, priorStart } from '../../src/core/population.js';
import { calibrationDoneness, calibrationParams, freshCalibration } from '../../src/core/record.js';
import { particleRows } from './shared.js';

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

function fileOf(p: Population): Record<string, unknown> {
  const { id, ...prior } = p;
  return { id: id, prior: prior };
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
const REFUSED: { why: string; mutate: Mutation }[] = [
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
  about: 'E7: a prior drawn from a population - the published one (fixtures/population.json), the literature\'s, one shifted every way and the literature\'s as a file from before 0.5 wrote it - and the population files a reader refuses. src/core/population.ts.',
  count: PRIOR_COUNT,
  seed: PRIOR_SEED,
  literatureId: LITERATURE_POPULATION.id,
  populations: [
    drawn('published', published),
    drawn('literature', fileOf(LITERATURE_POPULATION)),
    drawn('shifted', { ...fileOf(SHIFTED), fitted: '2026-11-01', covariance: [[1, 0], [0, 1]] }),
    // A file from before 0.5, with a spread for the carryover, which left the
    // particle (DECISIONS.md 95): read, and the spread ignored.
    drawn('before 0.5', { id: LITERATURE_POPULATION.id, prior: { ...fileOf(LITERATURE_POPULATION)['prior'] as object, tauAirScale: { median: 1, logSd: 0.35 } } }),
  ],
  refused: REFUSED.map((r) => {
    const f = JSON.parse(JSON.stringify(fileOf(SHIFTED))) as Record<string, unknown>;
    r.mutate(f);
    if (parsePopulation(f) !== null) throw new Error(`${r.why}: read`);
    return { why: r.why, file: f };
  }),
};
