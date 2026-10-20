/**
 * A git repository of a test's own, in the system's temporary directory: for
 * the tools that read and commit the words (tools/copyQueue.ts,
 * tools/copyEdit/), run on it instead of this checkout.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export interface Repo {
  dir: string;
  git: (...args: string[]) => string;
  write: (files: Record<string, string>) => void;
  /** Write `files`, stage them and commit; the new HEAD. */
  commit: (message: string, files: Record<string, string>) => string;
}

/** A catalogue's file, one entry a line, as copy/ lays them out. */
export function catalogue(locale: string, messages: Record<string, Record<string, string>>): string {
  const lines = Object.entries(messages).map(([k, e]) => `    ${JSON.stringify(k)}: { ${Object.entries(e)
    .map(([f, v]) => `${JSON.stringify(f)}: ${JSON.stringify(v)}`).join(', ')} }`);
  return `{\n  "locale": "${locale}",\n  "about": "a test's",\n  "messages": {\n${lines.join(',\n')}\n  }\n}\n`;
}

/** Every repository made, removed when the test process ends. */
const MADE: string[] = [];
process.on('exit', () => { for (const dir of MADE) rmSync(dir, { recursive: true, force: true }); });

/** A new repository on branch main, with one commit of `files`. */
export function scratchRepo(files: Record<string, string>): Repo {
  const dir = mkdtempSync(join(tmpdir(), 'aet-test-repo-'));
  MADE.push(dir);
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (fs: Record<string, string>): void => {
    for (const [path, text] of Object.entries(fs)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
  };
  git('init', '--quiet', '--initial-branch=main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
  git('config', 'commit.gpgsign', 'false');
  const commit = (message: string, fs: Record<string, string>): string => {
    write(fs);
    git('add', '--', ...Object.keys(fs));
    git('commit', '--quiet', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  commit('the first', files);
  return { dir: dir, git: git, write: write, commit: commit };
}
