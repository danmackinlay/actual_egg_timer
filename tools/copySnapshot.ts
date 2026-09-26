/**
 * Every word the web app renders, in every state tools/copy-snapshot.html
 * drives it through, written to a JSON file - or two such files compared.
 *
 *   npm run build
 *   node dist/tools/copySnapshot.js capture <out.json>
 *   node dist/tools/copySnapshot.js compare <before.json> <after.json>
 *
 * `capture` serves the repo root, opens the harness page in headless Chrome
 * over the DevTools protocol and waits for it to finish. It needs Chrome; set
 * CHROME to its binary if it is not in the usual macOS place. It is not part of
 * `npm test` for that reason: it is the proof that Phase F1 moved the copy into
 * copy/en.json without changing a byte of what is rendered, run before and
 * after the move, and it can be run again before any change that should not
 * touch the words.
 *
 * `compare` exits non-zero on the first difference and says where it is.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

  private constructor(private ws: WebSocket) {
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

const [mode, a, b] = process.argv.slice(2);
if (mode === 'capture' && a !== undefined) {
  await capture(a);
} else if (mode === 'compare' && a !== undefined && b !== undefined) {
  compare(a, b);
} else {
  console.error('usage: copySnapshot.js capture <out.json> | compare <before.json> <after.json>');
  process.exit(2);
}
