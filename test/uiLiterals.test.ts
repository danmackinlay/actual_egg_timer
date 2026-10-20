/**
 * No code in src/ui puts words of its own on screen: every word the web app
 * shows or says comes from copy/, through `t` and its kin. Read from the
 * TypeScript's syntax (`ts.createSourceFile`), a string literal, or a
 * template literal with a letter outside its `${}`, fails where it is given
 * to what the page shows or a screen reader says:
 *
 *   - assigned (`=`, `+=`) to `textContent`, `innerText`, `innerHTML`,
 *     `outerHTML`, `title` (`document.title` among them), `placeholder`,
 *     `alt` or an `aria…` property (`ariaLabel`);
 *   - the value of `setAttribute`, or of controls.ts's `setAttr(e, name,
 *     value)`, for `title`, `placeholder`, `alt` or an `aria-…` attribute;
 *   - an argument of `createTextNode`, `append`, `prepend`,
 *     `replaceChildren`, `before`, `after` or `insertAdjacentText`/`HTML`.
 *
 * Words are any letter left once the `${}` are out (and, for HTML, the tags
 * and entities): an empty string, whitespace, a symbol (− + · ×) or a number
 * passes. A conditional's branches, either side of `+`, `??`, `||` and `&&`,
 * and the literals inside a `${}` are read too; a call's arguments (a key
 * given to `t`) and a word routed through a name are not. Allowed, and only
 * these: an `aria-…` attribute that names ids, and an `aria-…` state's token.
 * index.html has its own check (copy.test.ts).
 *
 * Zero dependencies beyond the TypeScript the build already has.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

/** Properties whose value is on screen or said. */
const TEXT_PROPERTIES = new Set(['textContent', 'innerText', 'innerHTML', 'outerHTML', 'title', 'placeholder', 'alt']);
const HTML_PROPERTIES = new Set(['innerHTML', 'outerHTML']);
/** Attributes whose value is on screen or said, beside every `aria-…`. */
const TEXT_ATTRIBUTES = new Set(['title', 'placeholder', 'alt']);
/** Calls each of whose arguments, a string, becomes a text node. */
const NODE_CALLS = new Set(['createTextNode', 'append', 'prepend', 'replaceChildren', 'before', 'after']);

/** The allowance: `aria-…` attributes whose value is ids, never words, and
 *  the tokens an `aria-…` state takes. */
const ARIA_IDS = new Set([
  'aria-controls', 'aria-labelledby', 'aria-describedby', 'aria-owns', 'aria-activedescendant', 'aria-details',
  'aria-errormessage', 'aria-flowto',
]);
const ARIA_TOKENS = new Set(['true', 'false', 'mixed']);

/** A string the code wrote, where it is, and whether it is HTML. */
interface Written { text: string; node: ts.Node; html: boolean; aria: boolean }

/** The literal strings an expression can come to, as far as it is read. */
function literals(e: ts.Expression): ts.Node[] {
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isTemplateExpression(e)) {
    return ts.isTemplateExpression(e) ? [e, ...e.templateSpans.flatMap((s) => literals(s.expression))] : [e];
  }
  if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)) {
    return literals(e.expression);
  }
  if (ts.isConditionalExpression(e)) return [...literals(e.whenTrue), ...literals(e.whenFalse)];
  if (ts.isBinaryExpression(e) && [
    ts.SyntaxKind.PlusToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken,
    ts.SyntaxKind.AmpersandAmpersandToken,
  ].includes(e.operatorToken.kind)) {
    return [...literals(e.left), ...literals(e.right)];
  }
  return [];
}

/** A literal's own text: a template's, with its `${}` out. */
function ownText(n: ts.Node): string {
  if (ts.isTemplateExpression(n)) return [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(' ');
  return (n as ts.StringLiteral).text;
}

/** Whether a string the code wrote is words. */
function isWords(w: Written): boolean {
  let s = w.text;
  if (w.html) s = s.replace(/<[^>]*>/g, ' ').replace(/&[#a-zA-Z0-9]+;/g, ' ');
  if (w.aria && ARIA_TOKENS.has(s.trim())) return false;
  return /\p{L}/u.test(s);
}

/** The attribute a property names, `ariaValueText` as `aria-valuetext`. */
const ariaAttribute = (property: string): string => `aria-${property.slice(4).toLowerCase()}`;

/** An attribute's value, if the attribute is one the page shows or says. */
function attributeValue(name: ts.Expression | undefined, value: ts.Expression | undefined): Written[] {
  if (name === undefined || value === undefined || !ts.isStringLiteralLike(name)) return [];
  const aria = name.text.startsWith('aria-');
  if (aria ? ARIA_IDS.has(name.text) : !TEXT_ATTRIBUTES.has(name.text)) return [];
  return literals(value).map((n) => ({ text: ownText(n), node: n, html: false, aria: aria }));
}

/** Every string `source` gives to what the page shows or says. */
function written(file: string, source: string): Written[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: Written[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isBinaryExpression(n) && ts.isPropertyAccessExpression(n.left)
      && (n.operatorToken.kind === ts.SyntaxKind.EqualsToken || n.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken)) {
      const p = n.left.name.text;
      const aria = /^aria[A-Z]/.test(p);
      if (TEXT_PROPERTIES.has(p) || (aria && !ARIA_IDS.has(ariaAttribute(p)))) {
        for (const lit of literals(n.right)) out.push({ text: ownText(lit), node: lit, html: HTML_PROPERTIES.has(p), aria: aria });
      }
    }
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : '';
      const a = n.arguments;
      if (name === 'setAttribute' && ts.isPropertyAccessExpression(callee)) out.push(...attributeValue(a[0], a[1]));
      else if (name === 'setAttr' && ts.isIdentifier(callee)) out.push(...attributeValue(a[1], a[2]));
      else if (NODE_CALLS.has(name) && ts.isPropertyAccessExpression(callee)) {
        for (const arg of a) for (const lit of literals(arg)) out.push({ text: ownText(lit), node: lit, html: false, aria: false });
      } else if ((name === 'insertAdjacentText' || name === 'insertAdjacentHTML') && a.length === 2) {
        for (const lit of literals(a[1])) out.push({ text: ownText(lit), node: lit, html: name.endsWith('HTML'), aria: false });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Each string in `source` that is words on screen, as `file:line: "…"`;
 *  and how many strings it read there. */
function lintUi(file: string, source: string): { failures: string[]; read: number } {
  const all = written(file, source);
  const failures = all.filter(isWords).map((w) => {
    const sf = w.node.getSourceFile();
    const line = sf.getLineAndCharacterOfPosition(w.node.getStart(sf)).line + 1;
    return `${file}:${line}: ${w.node.getText(sf)} is words on screen; give it a key in copy/en.json`;
  });
  return { failures: failures, read: all.length };
}

/** Every .ts under `dir`, its development tools among them. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? sources(join(dir, d.name))
    : d.name.endsWith('.ts') ? [join(dir, d.name)] : []);
}

test('no code in src/ui puts words of its own on screen', () => {
  const files = sources('src/ui');
  const results = files.map((f) => lintUi(f, readFileSync(f, 'utf8')));
  assert.deepEqual(results.flatMap((r) => r.failures), []);
  // It reads what the page writes: the empty strings, the aria states and the
  // development clock's mark among them.
  assert.ok(results.reduce((n, r) => n + r.read, 0) >= 15, 'the strings given to the screen are read');
});

const fails = (source: string): number => lintUi('x.ts', source).failures.length;

test('words given to a text property fail, a template\'s too; a key, a symbol and nothing pass', () => {
  assert.equal(fails("el.textContent = 'Hello';"), 1);
  assert.equal(fails('el.innerText = `${n} eggs`;'), 1);
  assert.equal(fails("document.title = 'Egg timer';"), 1);
  assert.equal(fails("input.placeholder = 'Room'; img.alt = 'An egg'; b.ariaLabel = 'Close';"), 3);
  assert.equal(fails("el.textContent += ' more';"), 1);
  assert.equal(fails("el.textContent = t('readout.phase.done'); el.textContent = '';"), 0);
  assert.equal(fails("el.textContent = '−'; el.textContent = '·'; el.textContent = '12'; el.textContent = ' ';"), 0);
  assert.equal(fails('el.textContent = `${a} ${b}`; el.textContent = `×${s} ${neg ? \'−\' : \'+\'}${hms}`;'), 0);
});

test('a branch, a sum and a template\'s inside are read; a name and a call\'s arguments are not', () => {
  assert.equal(fails("el.textContent = done ? 'Done' : t('x.y');"), 1);
  assert.equal(fails("el.textContent = 'Eggs: ' + n;"), 1);
  assert.equal(fails("el.textContent = w.primary ?? 'Start';"), 1);
  assert.equal(fails('el.textContent = `${n}${one ? \' egg\' : \'\'}`;'), 1);
  assert.equal(fails("const s = 'Hello'; el.textContent = s; el.textContent = f('Hello');"), 0);
});

test('HTML is words only outside its tags and entities', () => {
  assert.equal(fails("el.innerHTML = '<b>Hi</b>';"), 1);
  assert.equal(fails("el.innerHTML = '<br>&nbsp;'; el.outerHTML = '';"), 0);
  assert.equal(fails("el.insertAdjacentHTML('beforeend', '<i>no</i>');"), 1);
});

test('attributes: title, placeholder, alt and aria-… words fail; ids, states and other attributes pass', () => {
  assert.equal(fails("el.setAttribute('aria-label', 'Close'); el.setAttribute('title', 'More');"), 2);
  assert.equal(fails("setAttr(input, 'placeholder', 'Room');"), 1);
  assert.equal(fails("el.setAttribute('aria-valuetext', `${n} degrees`);"), 1);
  assert.equal(fails("el.setAttribute('aria-pressed', on ? 'true' : 'false'); el.setAttribute('aria-controls', 'panelEgg');"), 0);
  assert.equal(fails("el.setAttribute('class', 'egg-section__shell'); el.setAttribute('role', 'button');"), 0);
  assert.equal(fails("el.setAttribute('aria-label', t('more.about', { label: t(k) }));"), 0);
});

test('a text node made or put in place with words fails; an element put in place passes', () => {
  assert.equal(fails("document.createTextNode('and');"), 1);
  assert.equal(fails("wrap.append('Hello', b); list.replaceChildren(' or ');"), 2);
  assert.equal(fails("el.insertAdjacentText('afterend', 'more');"), 1);
  assert.equal(fails("wrap.append(button); input.before(stepButton(input, false)); node.append(text.slice(0, 1));"), 0);
});
