/**
 * Every web scenario, by name, in the order `npm run e2e` runs them: each
 * area's, in this directory. Run by tools/e2e.ts; split into CI's shards by
 * shards.ts.
 */

import type { Scenario } from '../harness.ts';
import { cookScenarios } from './cook.ts';
import { correctionScenarios } from './corrections.ts';
import { layoutScenarios } from './layout.ts';
import { recordScenarios } from './record.ts';
import { storeScenarios } from './stores.ts';
import { tabScenarios } from './tabs.ts';

export function allScenarios(): Record<string, Scenario> {
  return {
    ...layoutScenarios, ...cookScenarios, ...correctionScenarios, ...recordScenarios, ...storeScenarios, ...tabScenarios,
  };
}
