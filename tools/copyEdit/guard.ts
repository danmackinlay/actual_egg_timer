/**
 * Who may reach the words' editor (tools/copyEdit/server.ts), which commits
 * to the repository: a request to this machine's loopback address, naming
 * the server by that address, carrying the token the command printed.
 *
 * - The server listens on 127.0.0.1 only, so nothing off this machine
 *   reaches it at all.
 * - The token, 16 random bytes, is the first segment of every path; a
 *   request without it is told nothing (404). It is new each run and kept
 *   nowhere but the address printed and opened.
 * - The Host must be the address the server printed (127.0.0.1 or
 *   localhost, at its port), so a web page elsewhere cannot reach it by
 *   pointing a name of its own at 127.0.0.1 (DNS rebinding).
 * - What writes is a POST of JSON, from the page's own origin if the browser
 *   says one, and no answer carries a CORS header: another site open in the
 *   same browser cannot post to it.
 *
 * Pure, so the tests decide every case without a socket.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';

/** A fresh token: 128 bits, as 22 characters fit for a path. */
export function newToken(): string {
  return randomBytes(16).toString('base64url');
}

/** Whether `given` is the token, compared in constant time. */
export function tokenMatches(given: string, token: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** What the guard reads of a request. */
export interface Asked {
  method: string;
  url: string;
  host: string | undefined;
  origin: string | undefined;
  contentType: string | undefined;
}

export type Verdict = { ok: true; path: string } | { ok: false; status: number; why: string };

/** The names the server answers to, at its port. */
export function hostsFor(port: number): string[] {
  return [`127.0.0.1:${port}`, `localhost:${port}`];
}

/** Whether a request may be answered, and the path it asks for under the
 *  token (`/`, `/api/state`, ...). */
export function judge(asked: Asked, token: string, port: number): Verdict {
  const hosts = hostsFor(port);
  if (asked.host === undefined || !hosts.includes(asked.host.toLowerCase())) {
    return { ok: false, status: 403, why: `Host ${String(asked.host)}` };
  }
  let pathname: string;
  try {
    pathname = new URL(asked.url, `http://${hosts[0]}`).pathname;
  } catch {
    return { ok: false, status: 400, why: 'a malformed address' };
  }
  const m = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  if (m === null || !tokenMatches(m[1], token)) return { ok: false, status: 404, why: 'no token, or the wrong one' };
  const path = m[2] ?? '';
  if (path === '') return { ok: true, path: '' };
  if (asked.method === 'GET') return { ok: true, path: path };
  if (asked.method !== 'POST') return { ok: false, status: 405, why: asked.method };
  if (!(asked.contentType ?? '').toLowerCase().startsWith('application/json')) {
    return { ok: false, status: 415, why: 'a write that is not JSON' };
  }
  if (asked.origin !== undefined && !hosts.map((h) => `http://${h}`).includes(asked.origin.toLowerCase())) {
    return { ok: false, status: 403, why: `Origin ${asked.origin}` };
  }
  return { ok: true, path: path };
}

/** The headers every answer carries: nothing cached, no Referer sent on, the
 *  page's scripts and styles its own, and never framed. */
export const HEADERS: Record<string, string> = {
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; "
    + "base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};
