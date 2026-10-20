/**
 * The setup sentence renders each clause's key, chosen by core
 * (`clauseKeys`), with `tChosen`, which the compiler cannot hold to the key's
 * arguments: a placeholder the sentence does not give would show raw. So
 * every placeholder of every key a clause can say, in every catalogue in
 * copy/, must be among the arguments src/ui/sentence.ts gives that clause.
 *
 * Those arguments are read from sentence.ts's syntax, not listed here: in
 * `clauseTexts`, the object literals bound to a name, the helper whose
 * `tChosen` calls take its last parameter (an object by default), and the
 * returned clauses, each the helper called with its keys and, or not, an
 * object of its own.
 *
 * Zero dependencies beyond the TypeScript the build already has.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

import { type Catalogue, parseCatalogue, placeholders, templatesOf } from '../src/core/copy.ts';
import { COOLINGS, HEATS_AFTER_BOIL, START_MODES } from '../src/core/protocol.ts';
import { EGG_FROMS } from '../src/core/record.ts';
import { type Clause, clauseKeys } from '../src/core/wording.ts';
import { catalogueTags } from '../tools/copyNotes.ts';

const SENTENCE = 'src/ui/sentence.ts';

/** Each clause's argument names, as sentence.ts's `clauseTexts` passes them. */
function clauseArguments(file: string, source: string): Map<string, string[]> {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let body: ts.Block | undefined;
  sf.forEachChild((n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === 'clauseTexts') body = n.body;
  });
  if (body === undefined) throw new Error(`${file}: no clauseTexts`);
  const objects = new Map<string, string[]>();
  let helper: { name: string; defaults: string } | null = null;
  let returned: ts.ObjectLiteralExpression | null = null;
  const names = (o: ts.ObjectLiteralExpression): string[] => o.properties.map((p) => {
    if (p.name === undefined || !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
      throw new Error(`${file}: an argument not named plainly`);
    }
    return p.name.text;
  });
  for (const st of body.statements) {
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || d.initializer === undefined) continue;
        if (ts.isObjectLiteralExpression(d.initializer)) objects.set(d.name.text, names(d.initializer));
        if (ts.isArrowFunction(d.initializer)) {
          const f = d.initializer;
          const last = f.parameters[f.parameters.length - 1];
          if (!ts.isIdentifier(last.name) || last.initializer === undefined || !ts.isIdentifier(last.initializer)) continue;
          // Every tChosen in it renders with that parameter.
          const withName = last.name.text;
          let calls = 0;
          const visit = (n: ts.Node): void => {
            if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'tChosen') {
              calls += 1;
              const a = n.arguments[1];
              assert.ok(a !== undefined && ts.isIdentifier(a) && a.text === withName,
                `${file}: ${d.name.getText(sf)} calls tChosen with ${a?.getText(sf)}, not ${withName}`);
            }
            ts.forEachChild(n, visit);
          };
          visit(f.body);
          if (calls > 0) helper = { name: d.name.text, defaults: last.initializer.text };
        }
      }
    }
    if (ts.isReturnStatement(st) && st.expression !== undefined && ts.isObjectLiteralExpression(st.expression)) {
      returned = st.expression;
    }
  }
  if (helper === null || returned === null) throw new Error(`${file}: clauseTexts' helper or its clauses not found`);
  const h: { name: string; defaults: string } = helper;
  const out = new Map<string, string[]>();
  for (const p of (returned as ts.ObjectLiteralExpression).properties) {
    if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name) || !ts.isCallExpression(p.initializer)
      || p.initializer.expression.getText(sf) !== h.name) {
      throw new Error(`${file}: the clause ${p.name?.getText(sf)} is not made by ${h.name}`);
    }
    const a = p.initializer.arguments;
    const given = a.length > 2 ? a[a.length - 1] : null;
    const object = given === null ? h.defaults : ts.isIdentifier(given) ? given.text : null;
    const args = object === null ? undefined : objects.get(object);
    if (args === undefined) throw new Error(`${file}: the ${p.name.text} clause's arguments are no object literal here`);
    out.set(p.name.text, args);
  }
  return out;
}

/** Every key each clause can say: its words and its chosen value, over
 *  every combination of what the clauses read. */
function clauseKeysSaid(): Map<Clause, Set<string>> {
  const said = new Map<Clause, Set<string>>();
  for (const eggFrom of EGG_FROMS) for (const startMode of START_MODES) for (const sousVide of [false, true]) {
    for (const afterBoil of HEATS_AFTER_BOIL) for (const cooling of COOLINGS) for (const coolingWaterGiven of [false, true]) {
      const keys = clauseKeys({ eggFrom, startMode, sousVide, afterBoil, cooling, coolingWaterGiven });
      for (const [clause, k] of Object.entries(keys) as [Clause, typeof keys[Clause]][]) {
        const set = said.get(clause) ?? new Set<string>();
        set.add(k.text);
        if (k.value !== null) set.add(k.value);
        said.set(clause, set);
      }
    }
  }
  return said;
}

/** Each placeholder a clause's key has in `cat` that `given` lacks. */
function missing(cat: Catalogue, tag: string, given: Map<string, string[]>): string[] {
  const out: string[] = [];
  for (const [clause, keys] of clauseKeysSaid()) {
    const args = given.get(clause) ?? [];
    for (const key of keys) {
      const m = cat.messages.get(key);
      if (m === undefined) continue; // English's, checked there
      for (const name of new Set(templatesOf(m).flatMap(placeholders))) {
        if (!args.includes(name)) out.push(`${tag} ${key}: {${name}}, but the ${clause} clause is given ${args.join(', ')}`);
      }
    }
  }
  return out;
}

test('every placeholder of a sentence clause\'s key, in every catalogue, is an argument sentence.ts gives it', () => {
  const given = clauseArguments(SENTENCE, readFileSync(SENTENCE, 'utf8'));
  assert.deepEqual([...given.keys()].sort(), ['cooling', 'egg', 'from', 'start']);
  const en = parseCatalogue(JSON.parse(readFileSync('copy/en.json', 'utf8')));
  const tags = catalogueTags();
  assert.ok(tags.length >= 2 && tags.includes('en'));
  for (const tag of tags) {
    const cat = tag === 'en' ? en : parseCatalogue(JSON.parse(readFileSync(`copy/${tag}.json`, 'utf8')), en);
    assert.deepEqual(missing(cat, tag, given), []);
  }
});

test('the arguments are read from the code: a clause given fewer is caught', () => {
  const source = readFileSync(SENTENCE, 'utf8');
  const given = clauseArguments(SENTENCE, source);
  // The start clause's sous-vide words name the bath; without it they show raw.
  const fewer = new Map(given);
  fewer.set('start', (given.get('start') ?? []).filter((a) => a !== 'bath'));
  const en = parseCatalogue(JSON.parse(readFileSync('copy/en.json', 'utf8')));
  assert.ok(missing(en, 'en', fewer).some((m) => m.includes('{bath}')), 'the bath dropped is missed');
  assert.throws(() => clauseArguments(SENTENCE, source.replace('function clauseTexts', 'function other')), /no clauseTexts/);
});
