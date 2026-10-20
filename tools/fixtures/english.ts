/**
 * The English catalogue, copy/en.json, for the fixtures that render words
 * with it: format, sousvideCopy and units. Apart from shared.ts, so that a
 * fixture showing no words does not reach them.
 */

import { readFileSync } from 'node:fs';

import { parseCatalogue } from '../../src/core/copy.ts';

export type CatalogueJson = { locale: string; messages: Record<string, Record<string, unknown>> };

export const englishJson = JSON.parse(readFileSync('copy/en.json', 'utf8')) as CatalogueJson;
export const english = parseCatalogue(englishJson);
