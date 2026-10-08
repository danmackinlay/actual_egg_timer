/**
 * Headless Chrome over the DevTools protocol, with nothing but Node: a
 * process started on a profile of its own, and one socket to talk to it.
 * For tools/copySnapshot.ts (one page, driven by the page itself) and
 * tools/e2e.ts (pages driven from here). Chrome is found where macOS and
 * Linux (GitHub's runners among them) put it; CHROME names another binary.
 * Under CI (the CI environment variable, which GitHub sets) Chrome runs
 * without its sandbox, which a runner's container may not allow: the pages
 * it opens are this repository's, served from this machine.
 */

import { ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PLACES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome',
  '/usr/bin/chromium', '/usr/bin/chromium-browser',
];

export const CHROME = process.env['CHROME'] ?? PLACES.find((p) => existsSync(p)) ?? PLACES[0];

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function waitForHttp(url: string): Promise<Response> {
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

interface Message {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message: string };
  sessionId?: string;
}

/** One DevTools socket: to a page, or to the browser with flat sessions on
 *  it (`session` names the page a command is for). */
export class Cdp {
  private next = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (e: Error) => void }>();
  private listeners: ((method: string, params: unknown, session: string | undefined) => void)[] = [];
  private ws: WebSocket;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data)) as Message;
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error !== undefined) p?.reject(new Error(msg.error.message));
        else p?.resolve(msg.result);
      } else if (msg.method !== undefined) {
        for (const f of this.listeners) f(msg.method, msg.params, msg.sessionId);
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

  send(method: string, params: object = {}, session?: string): Promise<unknown> {
    const id = this.next++;
    const msg: Message & { params: object } = { id: id, method: method, params: params };
    if (session !== undefined) msg.sessionId = session;
    this.ws.send(JSON.stringify(msg));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve: resolve, reject: reject }));
  }

  on(f: (method: string, params: unknown, session: string | undefined) => void): void {
    this.listeners.push(f);
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

/** A headless Chrome on a profile of its own, gone with `close`. */
export interface Browser {
  debugPort: number;
  /** The browser's own socket, for targets and sessions. */
  socket(): Promise<string>;
  close(): Promise<void>;
}

export async function launchChrome(args: string[], debugPort: number): Promise<Browser> {
  if (!existsSync(CHROME)) throw new Error(`no Chrome at ${CHROME}; set CHROME to its binary`);
  const profile = mkdtempSync(join(tmpdir(), 'aet-chrome-'));
  const child: ChildProcess = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`,
    // A page driven, never looked at, must not be throttled into missing the
    // ticks it is waited on for.
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    ...(process.env['CI'] !== undefined ? ['--no-sandbox'] : []),
    ...args,
  ], { stdio: 'ignore' });
  return {
    debugPort: debugPort,
    async socket() {
      const v = await (await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`)).json() as {
        webSocketDebuggerUrl: string;
      };
      return v.webSocketDebuggerUrl;
    },
    async close() {
      child.kill();
      await sleep(300);
      rmSync(profile, { recursive: true, force: true });
    },
  };
}
