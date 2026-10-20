/**
 * What the editor tells the owner when a draft breaks a rule
 * (tools/copyRules.ts), in his words rather than the tests': the same
 * problem the tests would print, said as what to do. The page and the
 * server both say it with this. Pure, so the page can bundle it.
 */

import type { Problem } from '../copyRules.ts';

/** Which catalogue a problem is in, as the owner calls it. */
export function catalogueName(tag: string): string {
  return tag === 'en' ? 'The English' : tag === 'en-US' ? 'The US line' : tag === 'en-x-1750' ? 'The 1750 line' : tag;
}

/** A problem as one sentence for the owner. */
export function problemWords(p: Problem): string {
  const where = `${p.key}: ${catalogueName(p.tag)}`;
  switch (p.rule) {
    case 'quote':
      return `${where} has a straight quote or apostrophe. Use ’ ‘ “ ” instead.`;
    case 'brace':
      return `${where} has a { or } that isn’t part of a placeholder.`;
    case 'measure':
      return `${where} must join {value} to its unit with a no-break space, and have no other space.`;
    case 'parity':
      return `${where} must use the same placeholders as the English: ${p.detail}.`;
    case 'plural':
      return `${where} has the wrong plural forms for its language: ${p.detail}.`;
    case 'link':
      return `${where} must link to the same sources as the English: it ${p.detail}.`;
    case 'number':
      return `${where} ${p.detail}. Write a number through a placeholder, so it comes out as the reader’s region writes it.`;
    case 'arguments':
      return `${where} must keep the placeholders it has (${p.detail}). Changing them needs a change to the code, so I can’t save it.`;
    case 'budget': {
      const m = /^(\d+) characters on "([^"]+)", budget (\d+)$/.exec(p.detail);
      return m === null ? `${where} is too long: ${p.detail}.`
        : `${where} is too long for a ${m[2]}: ${m[1]} characters, where there is room for ${m[3]}.`;
    }
    case 'overlay':
      if (p.field === 'base') {
        return `${where} was written for the English as it was. Check it still says the same for an American kitchen, then press “The US line is right”.`;
      }
      if (p.field === 'text') return `${where} now says what the English says, so it isn’t needed: remove it.`;
      return `${where}: ${p.detail}.`;
    case 'empty':
      return `${where} is empty.`;
    case 'shape':
      return `${where} is not an entry the apps can read: ${p.detail}.`;
  }
}
