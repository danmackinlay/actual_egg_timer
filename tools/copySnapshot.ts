/**
 * Every word the web app renders, in every state tools/copy-snapshot.html
 * drives it through, written to a JSON file - or two such files compared.
 *
 *   npm run build
 *   node dist/tools/copySnapshot.js capture <out.json>
 *   node dist/tools/copySnapshot.js compare <before.json> <after.json>
 *   node dist/tools/copySnapshot.js compare <before.json> <after.json> --draft [name]
 *
 * `capture` serves the repo root, opens the harness page in headless Chrome
 * over the DevTools protocol and waits for it to finish. It needs Chrome; set
 * CHROME to its binary if it is not in the usual macOS place. It is not part of
 * `npm test` for that reason. Run before and after a change that should not
 * touch the words, it proves that no byte of what is rendered moved.
 *
 * `compare` exits non-zero on the first difference and says where it is.
 *
 * `compare --draft` is the proof for a REWRITE, where the words are meant to
 * change and the screens may too - a new likelihood, say, moves the times a
 * second cook is shown.
 * It pools every string of every state on each side, rewrites the old side
 * through tools/copyDraft.ts, reads every digit as the same digit, and then
 * requires the two pools to hold the same strings: nothing new unless it is a
 * drafted string, and nothing gone unless it is a retired one. It says nothing
 * about which state a string is in; the ordinary `compare` is for that. The
 * draft is the latest in tools/copyDraft.ts unless one is named.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Templates, applyDraft, draftFor, templateRegExp } from './copyDraft.js';

interface Snapshot {
  name: string;
  lang: string;
  title: string;
  innerText: string;
  texts: string[];
  attrs: string[];
}

const CHROME = process.env['CHROME']
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitForHttp(url: string): Promise<Response> {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch {
      /* not up yet */
    }
    await sleep(100);
  }
  throw new Error(`nothing answered at ${url}`);
}

/** One DevTools session on one page: send a command, get its result. */
class Cdp {
  private next = 1;
  private pending = new Map<number, (value: unknown) => void>();
  private ws: WebSocket;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data)) as { id?: number; result?: unknown };
      if (msg.id !== undefined) {
        this.pending.get(msg.id)?.(msg.result);
        this.pending.delete(msg.id);
      }
    });
  }

  static async open(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', () => reject(new Error('DevTools socket failed')));
    });
    return new Cdp(ws);
  }

  send(method: string, params: object = {}): Promise<unknown> {
    const id = this.next++;
    this.ws.send(JSON.stringify({ id: id, method: method, params: params }));
    return new Promise((resolve) => this.pending.set(id, resolve));
  }

  async evaluate(expression: string): Promise<unknown> {
    const result = await this.send('Runtime.evaluate', { expression: expression, returnByValue: true }) as {
      result?: { value?: unknown };
    };
    return result.result?.value;
  }

  close(): void {
    this.ws.close();
  }
}

async function capture(out: string): Promise<void> {
  const port = 8391 + Math.floor(Math.random() * 500);
  const debugPort = port + 1000;
  const profile = mkdtempSync(join(tmpdir(), 'copy-snapshot-'));
  const children: ChildProcess[] = [];
  try {
    children.push(spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
      stdio: 'ignore',
    }));
    await waitForHttp(`http://127.0.0.1:${port}/index.html`);

    children.push(spawn(CHROME, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`,
      // The page is driven, never looked at: a background tab must not be
      // throttled into missing the ticks the harness waits for.
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      `http://127.0.0.1:${port}/tools/copy-snapshot.html`,
    ], { stdio: 'ignore' }));

    const list = await (await waitForHttp(`http://127.0.0.1:${debugPort}/json`)).json() as {
      type: string; url: string; webSocketDebuggerUrl: string;
    }[];
    const page = list.find((t) => t.type === 'page' && t.url.includes('copy-snapshot'));
    if (page === undefined) throw new Error('the harness page did not open');
    const cdp = await Cdp.open(page.webSocketDebuggerUrl);

    let title = '';
    for (let i = 0; i < 1200 && title !== 'done' && title !== 'failed'; i++) {
      await sleep(500);
      title = String(await cdp.evaluate('document.title'));
    }
    const status = String(await cdp.evaluate("document.getElementById('status').textContent"));
    if (title !== 'done') throw new Error(`harness did not finish: ${status}`);
    const encoded = String(await cdp.evaluate("document.getElementById('out').textContent"));
    cdp.close();

    const states = JSON.parse(decodeURIComponent(encoded)) as Snapshot[];
    writeFileSync(out, `${JSON.stringify(states, null, 1)}\n`);
    console.log(`${states.length} states -> ${out}`);
  } finally {
    for (const child of children) child.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
  }
}

function compare(beforePath: string, afterPath: string): void {
  const before = JSON.parse(readFileSync(beforePath, 'utf8')) as Snapshot[];
  const after = JSON.parse(readFileSync(afterPath, 'utf8')) as Snapshot[];
  if (before.length !== after.length) {
    throw new Error(`state count differs: ${before.length} before, ${after.length} after`);
  }
  let strings = 0;
  for (let i = 0; i < before.length; i++) {
    const a = before[i];
    const b = after[i];
    if (a.name !== b.name) throw new Error(`state ${i}: "${a.name}" before, "${b.name}" after`);
    for (const field of ['lang', 'title', 'innerText'] as const) {
      if (a[field] !== b[field]) {
        throw new Error(`${a.name}: ${field} differs\n--- before\n${a[field]}\n--- after\n${b[field]}`);
      }
    }
    for (const field of ['texts', 'attrs'] as const) {
      const x = a[field];
      const y = b[field];
      const n = Math.max(x.length, y.length);
      for (let j = 0; j < n; j++) {
        if (x[j] !== y[j]) {
          throw new Error(`${a.name}: ${field}[${j}] differs\n--- before\n${x[j]}\n--- after\n${y[j]}`);
        }
      }
      strings += x.length;
    }
  }
  const distinct = new Set(before.flatMap((s) => s.texts.concat(s.attrs)));
  console.log(`identical: ${before.length} states, ${strings} strings compared, `
    + `${distinct.size} distinct`);
}

/** Every string a snapshot holds, with every number read as one number and
 *  the noun after it as singular: a time that moved because the likelihood
 *  changed - "4 seconds" where it was "1 second" - is not a word that changed. */
function pool(states: Snapshot[], rewrite: (s: string) => string): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of states) {
    for (const text of [...s.texts, ...s.attrs, s.title]) {
      const t = rewrite(text);
      out.set(t.replace(/[0-9]+/g, '0').replace(/\b0 ([A-Za-z]+?)s\b/g, '0 $1'), t);
    }
  }
  return out;
}

function matchesAny(text: string, templates: string[]): boolean {
  return templates.some((t) => templateRegExp(t, false).test(text));
}

/** Whether `text` is the words between two placeholders of a template, as a
 *  text node of their own. The redesign's setup sentence draws each
 *  placeholder as a button, so what is left between them - ", " and "." in
 *  English - is a text node that belongs to the drafted template without
 *  matching it whole. */
function isPieceOfAny(text: string, templates: string[]): boolean {
  return templates.some((t) => t.split(/\{[A-Za-z][A-Za-z0-9_]*\}/)
    .some((piece) => piece.trim() !== '' && piece.trim() === text));
}

function compareDraft(beforePath: string, afterPath: string, draftName: string | undefined): void {
  // These are the web app's snapshots, so each row is read as the web sees
  // it: a key the web stops naming is retired here, whatever iOS still says
  // with it, and a key the web starts naming is new here. Rewriting the old
  // side with a key the web no longer shows would only corrupt it: the
  // redesign's "bath" -> "sous-vide at" (iOS only now) would rewrite every
  // "ice bath" on the old web screens.
  // The harness collapses every run of white space in a text node to one
  // space, a no-break space included ("I can't" in outcome.unsure), so each
  // template is read the same way.
  const flat = (t: Templates | null): Templates | null => (t === null ? null
    : Object.fromEntries(Object.entries(t).map(([c, s]) => [c, s.replace(/\s+/g, ' ')])));
  const rows = draftFor(draftName).rows.map((d) => ({
    ...d,
    before: d.appsBefore.includes('web') ? flat(d.before) : null,
    after: d.appsAfter.includes('web') ? flat(d.after) : null,
  }));
  const before = JSON.parse(readFileSync(beforePath, 'utf8')) as Snapshot[];
  const after = JSON.parse(readFileSync(afterPath, 'utf8')) as Snapshot[];
  const was = pool(before, (s) => applyDraft(s, rows));
  const is = pool(after, (s) => s);
  const added = rows.flatMap((d) => (d.after === null ? [] : Object.values(d.after)));
  const retired = rows.flatMap((d) => (d.before === null || d.after !== null ? [] : Object.values(d.before)));

  const failures: string[] = [];
  const appeared: string[] = [];
  const vanished: string[] = [];
  for (const [key, text] of is) {
    if (was.has(key)) continue;
    if (matchesAny(text, added) || isPieceOfAny(text, added)) appeared.push(text);
    else failures.push(`new, and not drafted: "${text}"`);
  }
  for (const [key, text] of was) {
    if (is.has(key)) continue;
    // A value, not a word: a stat's number, or the "--" before the first
    // solve. The redesign moved or dropped stats, and a number is not copy.
    if (!/[A-Za-z]{3,}/.test(text)) {
      vanished.push(text);
      continue;
    }
    // A rewrite that gained a placeholder the old screen had no value for
    // ("{water} of water takes ..."), so the rewritten old side still shows it.
    if (/\{[A-Za-z]+\}/.test(text) && matchesAny(text.replace(/\{[A-Za-z]+\}/g, 'x'), added)) {
      vanished.push(text);
      continue;
    }
    if (matchesAny(text, retired)) vanished.push(text);
    else failures.push(`gone, and not retired: "${text}"`);
  }
  // Every drafted rewrite the old build could show must have been shown by it,
  // or this proves nothing about it.
  const rewritten = rows.filter((d) => d.before !== null && d.after !== null
    && JSON.stringify(d.before) !== JSON.stringify(d.after));
  const seen = rewritten.filter((d) => before.some((s) => [...s.texts, ...s.attrs]
    .some((t) => matchesAny(t, Object.values(d.before ?? {})))));

  console.log(`${before.length} states before, ${after.length} after; `
    + `${was.size} distinct strings before (drafted rewrites applied), ${is.size} after.`);
  console.log(`drafted rewrites exercised by the web app: ${seen.map((d) => d.key).join(', ')}`);
  console.log(`new, as drafted: ${[...new Set(appeared)].map((s) => `"${s}"`).join(', ') || 'none'}`);
  console.log(`gone, as retired: ${[...new Set(vanished)].map((s) => `"${s}"`).join(', ') || 'none'}`);
  if (failures.length > 0) {
    console.log(`\n${failures.length} failures:\n${failures.join('\n')}`);
    process.exit(1);
  }
  console.log('only the drafted strings changed.');
}

const [mode, a, b, flag, draftName] = process.argv.slice(2);
if (mode === 'capture' && a !== undefined) {
  await capture(a);
} else if (mode === 'compare' && a !== undefined && b !== undefined && flag === '--draft') {
  compareDraft(a, b, draftName);
} else if (mode === 'compare' && a !== undefined && b !== undefined) {
  compare(a, b);
} else {
  console.error('usage: copySnapshot.js capture <out.json> | compare <before.json> <after.json> [--draft [name]]');
  process.exit(2);
}
