/**
 * Text compared as it reads. A measure's value and its unit are joined by a
 * no-break space (U+00A0; the `format.*` keys of copy/en.json), so a line
 * never breaks between "1.5" and "L". To a reader, and to a screen reader, it
 * is a space. So the tests, and the e2e harnesses where they read the app's
 * words, compare text through `asRead`, and write what they expect with
 * ordinary spaces. The one test of that space itself (copy.test.ts)
 * compares the raw text.
 */

/** `text` with each no-break space as the space it reads as. */
export function asRead(text: string): string {
  return text.replace(/ /g, ' ');
}
