/**
 * The words' editor driven end to end, in headless Chrome, against a
 * scratch clone of this repository, never the repository itself:
 *
 *   npm run copy:edit:e2e
 *
 * It clones HEAD into the system's temporary directory (its branch called
 * main there, and no remote, so nothing can be pushed), links this
 * checkout's node_modules into it, and starts `npm run copy:edit` there with
 * --scratch, which lets approving run from an agent's shell in such a clone
 * and nowhere else. Then, through the page: a wrong token and a wrong Host
 * are refused; a key is found by search and edited; a straight quote stops
 * Save and is made curly; the edit is saved with ⌘S, which runs the real
 * words-only check (fixtures:check -- --words and test:words) in a scratch
 * worktree of the clone, in seconds, and the page says what it checked and
 * how long it took; the commit is the key's, on the clone's main; and the
 * words are approved. Last, this checkout is as it was. Needs Chrome
 * (tools/chrome.ts); not part of npm test, since it runs tests itself.
 */

import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { request } from 'node:http';
import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Cdp, launchChrome, sleep } from './chrome.ts';

const KEY = 'action.startAgain';
const WORDS = 'Start over';

const here = (...args: string[]): string => execFileSync('git', args, { encoding: 'utf8' }).trim();
const steps: string[] = [];
function step(what: string): void {
  steps.push(what);
  console.log(`ok    ${what}`);
}
function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
  step(what);
}

/** A GET with the Host given, as a page elsewhere would send it. */
function getWithHost(port: number, path: string, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: port, path: path, headers: { host: host } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });
}

const headBefore = here('rev-parse', 'HEAD');
const statusBefore = here('status', '--porcelain');
const root = mkdtempSync(join(realpathSync(tmpdir()), 'aet-words-e2e-'));
const clone = join(root, 'repo');
let server: ChildProcess | null = null;
let browser: Awaited<ReturnType<typeof launchChrome>> | null = null;

try {
  execFileSync('git', ['clone', '--quiet', '--no-hardlinks', '.', clone]);
  const inClone = (...args: string[]): string => execFileSync('git', args, { cwd: clone, encoding: 'utf8' }).trim();
  inClone('checkout', '--quiet', '-B', 'main');
  inClone('remote', 'remove', 'origin');
  symlinkSync(realpathSync('node_modules'), join(clone, 'node_modules'));
  const start = inClone('rev-parse', 'HEAD');
  step(`a scratch clone of ${start.slice(0, 8)} on main, with no remote, in ${root}`);

  // The editor, in the clone.
  // This checkout's editor, as it is, on the clone's words.
  server = spawn(process.execPath, [join(import.meta.dirname, 'copyEdit', 'server.ts'), '--port', '0', '--no-open', '--scratch'],
    { cwd: clone, stdio: ['ignore', 'pipe', 'pipe'] });
  let printed = '';
  server.stdout?.on('data', (d: Buffer) => { printed += d.toString(); });
  server.stderr?.on('data', (d: Buffer) => { printed += d.toString(); });
  let url = '';
  for (let i = 0; i < 200 && url === ''; i++) {
    url = /http:\/\/127\.0\.0\.1:\d+\/[A-Za-z0-9_-]{22}\//.exec(printed)?.[0] ?? '';
    if (url === '') await sleep(100);
  }
  check(url !== '', `the editor printed its address (${url.replace(/[^/]{22}\/$/, '<token>/')})`);
  const port = Number(new URL(url).port);
  const token = new URL(url).pathname.split('/')[1] as string;

  check((await fetch(`http://127.0.0.1:${port}/${'x'.repeat(22)}/api/state`)).status === 404, 'a wrong token is told nothing');
  check((await fetch(`http://127.0.0.1:${port}/api/state`)).status === 404, 'no token is told nothing');
  check(await getWithHost(port, `/${token}/api/state`, `evil.example:${port}`) === 403, 'another name for this machine is refused');
  const form = await fetch(`${url}api/save`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
  check(form.status === 415, 'a write that is not JSON is refused');

  // The page.
  const debugPort = 9300 + Math.floor(Math.random() * 500);
  browser = await launchChrome(['about:blank'], debugPort);
  await browser.socket();
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[];
  const page = await Cdp.open((targets.find((t) => t.type === 'page') as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl);
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await page.send('Page.navigate', { url: url });
  const until = async (expression: string, what: string, ms = 20_000): Promise<void> => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await page.evaluate(expression) === true) return;
      await sleep(200);
    }
    throw new Error(`timed out waiting for ${what}: ${String(await page.evaluate('document.body.innerText.slice(0, 2000)'))}`);
  };
  const text = async (selector: string): Promise<string> => String(await page.evaluate(
    `(document.querySelector(${JSON.stringify(selector)})?.innerText ?? '')`));
  const key = async (k: string, code: string, modifiers = 0, keyCode = 0): Promise<void> => {
    for (const type of ['rawKeyDown', 'keyUp'] as const) {
      await page.send('Input.dispatchKeyEvent', { type: type, key: k, code: code, modifiers: modifiers, windowsVirtualKeyCode: keyCode });
    }
  };
  const typeInto = async (selector: string, words: string): Promise<void> => {
    await page.evaluate(`(() => { const t = document.querySelector(${JSON.stringify(selector)}); t.focus(); t.select(); })()`);
    await page.send('Input.insertText', { text: words });
  };

  await until('document.querySelectorAll(".row").length > 0', 'the list of keys');
  step(`the page opened: ${await text('#where')}`);

  // Found by search, edited in place.
  await typeInto('#search', KEY);
  await until(`[...document.querySelectorAll('.row code')].some((c) => c.textContent === ${JSON.stringify(KEY)})`, 'the key found');
  await key('Enter', 'Enter', 0, 13);
  await until(`document.querySelector('#card h2')?.textContent === ${JSON.stringify(KEY)}`, 'its card');
  check(await page.evaluate('document.activeElement?.tagName') === 'TEXTAREA', 'Enter in the search opens the first key\'s English to edit');
  const field = '#card textarea[data-form="text"]';
  await typeInto(field, 'Start \'over\'');
  await until('document.querySelector("#save").disabled === true', 'Save held');
  check((await text('#card .problems')).includes('straight quote'), 'a straight quote is told, and Save is held');
  await page.evaluate(`[...document.querySelectorAll('#card button')].find((b) => b.textContent === 'Make the quotes curly').click()`);
  await until(`document.querySelector(${JSON.stringify(field)}).value === 'Start ‘over’'`, 'the quotes curled');
  check((await text('#card .problems')) === '', 'made curly, the problem goes');
  await typeInto(field, WORDS);
  await until('document.querySelector("#save").disabled === false', 'Save ready');
  check((await text('#card .preview')) === WORDS, `the preview shows “${WORDS}”, and Save is ready`);
  check((await text('#status')).includes('1 key edited'), 'the bar counts the edit');

  // Esc leaves the field; j and k move between keys outside it.
  await key('Escape', 'Escape', 0, 27);
  check(await page.evaluate('document.activeElement?.tagName') !== 'TEXTAREA', 'Esc leaves the field');

  // Saved with ⌘S: the real checks, in a scratch worktree of the clone.
  const pressed = Date.now();
  await key('s', 'KeyS', 4, 83);
  await until('!document.querySelector("#sheet").hidden', 'the saving sheet');
  step(`⌘S saves: ${await text('#sheet')}`.replace(/\s+/g, ' '));
  await until('/^(Saved|Not saved)/.test(document.querySelector("#sheet h3")?.textContent ?? "")', 'the save to end', 600_000);
  const sheet = await text('#sheet');
  check(await page.evaluate('document.querySelector("#sheet h3").textContent') === 'Saved', `saved: ${sheet.replace(/\s+/g, ' ')}`);
  check(/I checked the tests and fixtures that read the words in \d+ s; the full suite runs before a release\./.test(await text('#checked')),
    `the page says what it checked, and how long it took (${((Date.now() - pressed) / 1000).toFixed(1)} s from ⌘S)`);
  const saved = inClone('rev-parse', 'HEAD');
  check(inClone('rev-parse', 'HEAD^') === start, 'one commit on the clone\'s main');
  check(inClone('log', '-1', '--format=%s') === `${KEY} in the owner's words`, `its subject: ${KEY} in the owner's words`);
  const files = inClone('show', '--name-only', '--format=', 'HEAD').split('\n');
  check(files.includes('copy/en.json') && files.every((f) => f.startsWith('copy/') || f.startsWith('fixtures/')),
    `it holds ${files.join(', ')}`);
  check(readFileSync(join(clone, 'copy/en.json'), 'utf8').includes(`"${KEY}": { "text": "${WORDS}" },`), 'the line, in the file\'s layout');
  check(inClone('status', '--porcelain', '--', 'copy', 'fixtures') === '', 'the clone\'s words and fixtures are clean');
  check(!inClone('worktree', 'list').includes('aet-copy-edit-'), 'no scratch worktree is left');
  await page.evaluate(`document.querySelector('#sheetClose')?.click()`);

  // j and k.
  await until(`document.querySelector('#where').textContent.includes(${JSON.stringify(saved.slice(0, 8))})`, 'the page at the new HEAD');
  // The search cleared, the list is the queue again: the key just saved is in it.
  await page.evaluate(`(() => { const s = document.querySelector('#search'); s.value = ''; s.dispatchEvent(new Event('input')); s.blur(); })()`);
  check(Number(await page.evaluate('document.querySelectorAll(".row").length')) > 1, 'with the search cleared, the list is the queue');
  const before = await text('#card h2');
  await key('j', 'KeyJ', 0, 74);
  await until(`document.querySelector('#card h2')?.textContent !== ${JSON.stringify(before)}`, 'j to move on');
  await key('k', 'KeyK', 0, 75);
  await until(`document.querySelector('#card h2')?.textContent === ${JSON.stringify(before)}`, 'k to move back');
  step('j moves to the next key and k back');

  // Approved, by the owner's button: twice pressed.
  await page.evaluate(`document.querySelector('#approveAsk').click()`);
  await until('document.querySelector("#approveYes") !== null', 'the question');
  step(`Approve asks first: ${await text('#approve')}`.replace(/\s+/g, ' '));
  await page.evaluate(`document.querySelector('#approveYes').click()`);
  await until('/^(Approved|Not approved)/.test(document.querySelector("#sheet h3")?.textContent ?? "")', 'the approval');
  check(await page.evaluate('document.querySelector("#sheet h3").textContent') === 'Approved', `approved: ${(await text('#sheet')).replace(/\s+/g, ' ')}`);
  check(inClone('log', '-1', '--format=%s') === `The words approved at ${saved.slice(0, 8)}`, `its subject: The words approved at ${saved.slice(0, 8)}`);
  check(inClone('show', '--name-only', '--format=', 'HEAD') === 'test/data/copy-approved.txt', 'it holds the approval alone');
  check(readFileSync(join(clone, 'test/data/copy-approved.txt'), 'utf8') === `${saved}\n`, 'the commit the page showed');
  page.close();

  check(here('rev-parse', 'HEAD') === headBefore && here('status', '--porcelain') === statusBefore,
    'this checkout is as it was: its HEAD and its status');
  console.log(`${steps.length} steps passed`);
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  server?.kill();
  await browser?.close();
  try { execFileSync('git', ['worktree', 'prune'], { cwd: clone }); } catch { /* the clone may not exist */ }
  rmSync(root, { recursive: true, force: true });
}
