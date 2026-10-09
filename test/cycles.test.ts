/**
 * No import cycles in src/. A module in a cycle can be read before it has
 * run, so an imported `const` is still in its temporal dead zone and a call
 * across the cycle at load time throws; which way round depends on which
 * module a page happens to load first.
 *
 * The rule: every static `import … from './x.js'`, `import './x.js'` and
 * `export … from './x.js'` between files under src/ is an edge, whether the
 * names it brings are used as values or only as types. Only what is written
 * `import type` or `export type` is left out: the compiler erases it, and it
 * says so in the source. A dynamic `import()` is not an edge: it runs after
 * every module has loaded.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, relative } from 'node:path';

/** `import … from '…'`, `import '…'`, `export … from '…'`, over lines. The
 *  first group is `type` when the whole statement is type-only. */
const STATIC = /^[ \t]*(?:import|export)[ \t]+(type[ \t]+)?(?:[\w*{}\s,$]*?from[ \t]*)?['"]([^'"]+)['"]/gm;

/** Every .ts file under `root`, by its path relative to `root`. */
function sources(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith('.ts')) out.push(relative(root, join(entry.parentPath, entry.name)));
  }
  return out.sort();
}

/** Each file's imports of other files under `root`, type-only ones left out. */
function importGraph(root: string): Map<string, string[]> {
  const files = sources(root);
  const known = new Set(files);
  const graph = new Map<string, string[]>();
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8');
    const to: string[] = [];
    for (const m of text.matchAll(STATIC)) {
      if (m[1] !== undefined || !m[2].startsWith('.')) continue;
      const target = normalize(join(dirname(file), m[2])).replace(/\.js$/, '.ts');
      if (known.has(target) && !to.includes(target)) to.push(target);
    }
    graph.set(file, to);
  }
  return graph;
}

/** One cycle through each back edge of a depth-first walk, as the files in
 *  order with the first repeated at the end: none if and only if the graph
 *  has no cycle. */
function importCycles(graph: Map<string, string[]>): string[][] {
  const done = new Set<string>();
  const path: string[] = [];
  const onPath = new Set<string>();
  const found: string[][] = [];
  const walk = (file: string): void => {
    path.push(file);
    onPath.add(file);
    for (const next of graph.get(file) ?? []) {
      if (onPath.has(next)) found.push([...path.slice(path.indexOf(next)), next]);
      else if (!done.has(next)) walk(next);
    }
    path.pop();
    onPath.delete(file);
    done.add(file);
  };
  for (const file of graph.keys()) if (!done.has(file)) walk(file);
  return found;
}

test('1. src/ has no import cycle', () => {
  const graph = importGraph('src');
  assert.ok(graph.size > 50 && (graph.get('ui/app.ts') ?? []).length > 10, 'the walk found the app and its imports');
  const cycles = importCycles(graph).map((c) => c.join(' -> '));
  assert.deepEqual(cycles, []);
});

test('2. a cycle is caught, through any static import, but not through a type-only one or import()', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aet-cycles-'));
  const write = (files: Record<string, string>): void => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
  };
  try {
    write({
      'ui/a.ts': "import {\n  b,\n  B2,\n} from './b.js';\nimport type { T } from '../core/t.js';\nexport const a = b;\n",
      'ui/b.ts': "export { c as b } from './c.js';\nexport const B2 = 2;\n",
      'ui/c.ts': "import './d.js';\nexport const c = 1;\n",
      'ui/d.ts': "import type { A } from './a.js';\nexport type { T } from '../core/t.js';\n",
      'ui/e.ts': "export async function later(): Promise<number> { return (await import('./a.js')).a; }\n",
      'core/t.ts': "export type { E } from '../ui/e.js';\nexport interface T { x: number }\n",
    });
    assert.deepEqual(importGraph(dir).get('ui/a.ts'), ['ui/b.ts']);
    assert.deepEqual(importCycles(importGraph(dir)), [], 'type-only imports and import() are not edges');
    // d's import of a, written as a value import: a -> b -> c -> d -> a.
    write({ 'ui/d.ts': "import { a } from './a.js';\nexport const d = a;\n" });
    assert.deepEqual(importCycles(importGraph(dir)), [['ui/a.ts', 'ui/b.ts', 'ui/c.ts', 'ui/d.ts', 'ui/a.ts']]);
    // A module importing itself is a cycle too.
    write({ 'ui/d.ts': "export const d = 1;\n", 'ui/e.ts': "import { e as f } from './e.js';\nexport const e = 1;\nvoid f;\n" });
    assert.deepEqual(importCycles(importGraph(dir)), [['ui/e.ts', 'ui/e.ts']]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
