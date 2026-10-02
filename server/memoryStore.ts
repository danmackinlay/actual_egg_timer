/**
 * A store in memory, behaving as Netlify Blobs does for the five calls the
 * endpoint makes: for the tests, and for the local dev server
 * (`tools/devServer.ts`), where nothing should outlive the process.
 */

import { Store } from './eggs.js';

export class MemoryStore implements Store {
  readonly blobs = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.blobs.get(key) ?? null;
  }

  async set(key: string, value: string, onlyIfNew: boolean): Promise<boolean> {
    if (onlyIfNew && this.blobs.has(key)) return false;
    this.blobs.set(key, value);
    return true;
  }

  async list(prefix: string): Promise<string[]> {
    return [...this.blobs.keys()].filter((k) => k.startsWith(prefix)).sort();
  }

  async delete(key: string): Promise<void> {
    this.blobs.delete(key);
  }
}
