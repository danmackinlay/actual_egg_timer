/**
 * The page's one way in: a message (model.ts, `Msg`), handed to the runner
 * (cook.ts, `dispatch`), which takes it through `update` and carries out what
 * it asks. Every change to the page is one. The modules the runner itself
 * imports - the controls, the corrections, the questions, the stores' effects
 * - send through here rather than import it, which would be a cycle; the
 * runner plugs itself in at boot (`sendTo`).
 */

import type { Msg } from './model.js';

let sink: ((msg: Msg) => void) | null = null;

/** Hand `msg` to the runner. Nothing before boot. */
export function send(msg: Msg): void {
  if (sink !== null) sink(msg);
}

/** The runner: once, at boot. */
export function sendTo(dispatch: (msg: Msg) => void): void {
  sink = dispatch;
}
