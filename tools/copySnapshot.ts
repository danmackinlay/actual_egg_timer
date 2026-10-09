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
 * CHROME to its binary if it is not where macOS or Linux put it. It is not
 * part of `npm test` for that reason. Run before and after a change that should not
 * touch the words, it proves that no byte of what is rendered moved.
 *
 * `compare` exits non-zero on the first difference and says where it is.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

import { Cdp, launchChrome, sleep, waitForHttp } from './chrome.js';

interface Snapshot {
  name: string;
  lang: string;
  title: string;
  innerText: string;
  texts: string[];
  attrs: string[];
}

async function capture(out: string): Promise<void> {
  const port = 8391 + Math.floor(Math.random() * 500);
  const debugPort = port + 1000;
  const children: ChildProcess[] = [];
  let chrome: Awaited<ReturnType<typeof launchChrome>> | null = null;
  try {
    children.push(spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
      stdio: 'ignore',
    }));
    await waitForHttp(`http://127.0.0.1:${port}/index.html`);

    chrome = await launchChrome([`http://127.0.0.1:${port}/tools/copy-snapshot.html`], debugPort);

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
    if (chrome !== null) await chrome.close();
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
