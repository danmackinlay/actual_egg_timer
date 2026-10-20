/**
 * The words' editor: the owner's page for changing the words both apps
 * show, served from this checkout to his own browser, which it opens.
 *
 *   npm run copy:edit [-- --port N] [--no-open] [--scratch]
 *
 * It listens on 127.0.0.1 only, behind a token new each run (guard.ts),
 * and serves one page (page.ts, editor.ts, bundled by esbuild as it starts)
 * and its API:
 *
 *   GET  api/state    the words at HEAD, the approved words, the queue
 *                     (tools/copyQueue.ts, as copy:review has it), the
 *                     notes and surfaces, and what stops a save or approval
 *   GET  api/head     HEAD and what stops a save, polled to see main move
 *   POST api/save     the owner's edits, checked and committed (save.ts);
 *                     it runs some seconds, so it answers at once
 *   GET  api/job      that save's stage, and its result when it ends
 *   POST api/approve  approve the commit the page showed (save.ts)
 *
 * Words are committed to main, by name, and never pushed. `--scratch` is
 * for the editor's own end-to-end check (tools/copyEditE2e.ts), in a clone
 * under the temporary directory: it lets approving run from an agent's
 * shell there, and is refused anywhere else. PORT or --port sets the port.
 * Without one it is 7457, or any free port when that is taken: the address
 * is new each run anyway (the token) and is opened for the owner. 8765, the
 * first default, is Anki's AnkiConnect.
 */

import { spawn } from 'node:child_process';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { join } from 'node:path';
import { build } from 'esbuild';

import { git, messagesAt, readApproved, reviewQueue } from '../copyQueue.ts';
import { HEADERS, judge, newToken } from './guard.ts';
import { PAGE_CSS, pageHtml } from './page.ts';
import { CATALOGUES, EDITABLE, type SaveRequest, type SaveResult, approveShown, approvingOff, cataloguesAt, isUnderTmp,
  notesAt, preflight, save, sweepScratch } from './save.ts';

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(name);
const option = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

/** The port when none is given; any free one when it is taken. */
const DEFAULT_PORT = 7457;

const CWD = process.cwd();
const SCRATCH = flag('--scratch');
if (SCRATCH && !isUnderTmp(CWD)) {
  console.error('--scratch is for a clone under the temporary directory, and this is not one.');
  process.exit(1);
}
const GIVEN = option('--port') ?? process.env['PORT'];
const PORT = Number(GIVEN ?? DEFAULT_PORT);
const TOKEN = newToken();
/** The port listened on: PORT, or the one given for 0. */
let port = PORT;
const APPROVE_OFF = approvingOff(CWD, process.env, SCRATCH);

const bundle = await build({
  entryPoints: [join(import.meta.dirname, 'editor.ts')], bundle: true, write: false, format: 'iife',
  target: 'es2022', platform: 'browser', logLevel: 'silent',
});
const SCRIPT = bundle.outputFiles[0].text;

/* ------------------------------------------------------------ the API */

function state(): unknown {
  const head = git(CWD, 'rev-parse', 'HEAD');
  const queue = reviewQueue(CWD, head);
  const { notes, surfaces } = notesAt(CWD, head);
  const approved = readApproved(CWD);
  return {
    head: head,
    approved: approved,
    queue: queue.keys,
    catalogues: Object.fromEntries(cataloguesAt(CWD, head)),
    approvedMessages: Object.fromEntries(EDITABLE.map((tag) => [tag, messagesAt(tag, approved, CWD)])),
    tags: CATALOGUES,
    notes: notes,
    surfaces: surfaces,
    blocked: preflight(CWD),
    approveBlocked: preflight(CWD, true),
    approveOff: APPROVE_OFF,
  };
}

/** The one save that may run, its stage and, once it ends, its result. */
let job: { id: number; stage: string; result: SaveResult | null } | null = null;
let jobs = 0;

function startSave(request: SaveRequest): unknown {
  if (job !== null && job.result === null) return { error: 'I’m saving already; wait for it to finish.' };
  jobs += 1;
  const mine = { id: jobs, stage: 'Checking the words', result: null as SaveResult | null };
  job = mine;
  console.log(`saving ${request.edits.map((e) => `${e.key}${e.tag === 'en' ? '' : ` (${e.tag})`}`).join(', ')}`);
  save(CWD, request, undefined, (s) => { mine.stage = s; })
    .catch((e: unknown): SaveResult => ({ ok: false, reasons: [`Something went wrong: ${(e as Error).message}`] }))
    .then((result) => {
      mine.result = result;
      console.log(result.ok ? `committed ${result.commit.slice(0, 10)} ${result.subject}` : `not saved: ${result.reasons.join(' ')}`);
    });
  return { job: mine.id };
}

/* ------------------------------------------------------------ the server */

function send(res: ServerResponse, status: number, type: string, body: string, extra: Record<string, string> = {}): void {
  res.writeHead(status, { ...HEADERS, 'content-type': type, ...extra });
  res.end(body);
}
const json = (res: ServerResponse, body: unknown, status = 200): void =>
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(body));

async function body(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 1 << 20) throw new Error('too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function answer(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const verdict = judge({
    method: req.method ?? 'GET', url: req.url ?? '/', host: req.headers.host,
    origin: req.headers.origin, contentType: req.headers['content-type'],
  }, TOKEN, port);
  if (!verdict.ok) {
    if (verdict.status !== 404) console.log(`refused ${req.method} ${verdict.why}`);
    send(res, verdict.status, 'text/plain; charset=utf-8', 'Not here.');
    return;
  }
  const route = `${req.method} ${verdict.path}`;
  switch (route) {
    case 'GET ': send(res, 301, 'text/plain', '', { location: `/${TOKEN}/` }); return;
    case 'GET /': send(res, 200, 'text/html; charset=utf-8', pageHtml()); return;
    case 'GET /editor.js': send(res, 200, 'text/javascript; charset=utf-8', SCRIPT); return;
    case 'GET /editor.css': send(res, 200, 'text/css; charset=utf-8', PAGE_CSS); return;
    case 'GET /api/state': json(res, state()); return;
    case 'GET /api/head': json(res, { head: git(CWD, 'rev-parse', 'HEAD'), blocked: preflight(CWD) }); return;
    case 'GET /api/job': json(res, job === null ? { job: null } : { job: job.id, stage: job.stage, result: job.result }); return;
    case 'POST /api/save': json(res, startSave(await body(req) as SaveRequest)); return;
    case 'POST /api/approve': {
      const { commit } = await body(req) as { commit: string };
      const result = approveShown(CWD, String(commit), APPROVE_OFF);
      console.log(result.ok ? `approved: ${result.subject}` : `not approved: ${result.reasons.join(' ')}`);
      json(res, result);
      return;
    }
    default: send(res, 404, 'text/plain; charset=utf-8', 'Not here.');
  }
}

sweepScratch(CWD);
const server = createServer((req, res) => {
  answer(req, res).catch((e: unknown) => {
    console.error(e);
    if (!res.headersSent) json(res, { error: (e as Error).message }, 500);
  });
});
server.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE' && GIVEN === undefined && !server.listening) {
    console.log(`Port ${PORT} is taken, so I’m using a free one.`);
    server.listen(0, '127.0.0.1');
    return;
  }
  console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is taken: is the editor running already? Leave out --port and I’ll take a free one.` : e.message);
  process.exit(1);
});
server.on('listening', () => {
  port = (server.address() as { port: number }).port;
  const url = `http://127.0.0.1:${port}/${TOKEN}/`;
  console.log(`The words' editor: ${url}`);
  console.log(APPROVE_OFF ?? 'It commits to main and never pushes. Ctrl-C stops it.');
  if (!flag('--no-open')) spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
});
server.listen(PORT, '127.0.0.1');
