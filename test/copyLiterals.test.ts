/**
 * `npm run copy:literals` (tools/copyLiterals.ts) fails a literal that puts
 * words on an iOS screen however it gets there: written into a text call,
 * through a name, or through a helper of the app's own; and passes what
 * reaches no screen. A planted file is read beside the app's own sources, so
 * the helpers it calls are the app's.
 *
 * Zero dependencies: node:test + node:assert/strict only.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { appSources, lintLiterals } from '../tools/copyLiterals.ts';

const PLANTED = `
import SwiftUI

struct Planted: View {
    var heading: String { "Eggs are ready" }
    let done: Bool

    var body: some View {
        VStack {
            let hint = "Stir them once"; Text(hint); Text(heading)
            warning("Take the pan off the heat")
            Text("Eggs in")
            Label("Pull them out", systemImage: "egg")
            Image(systemName: "checkmark")
            MoreText(["Cool them in ice water"])
            para("Keep the lid on")
            Text(tr(.\`controls.size.measured\`, ["mass": .string(weight)]))
        }
        .accessibilityLabel(done ? "Done" : tr(.\`more.expanded\`))
    }

    private func warning(_ text: String) -> some View { Text(text) }

    func ring() {
        content.body = "Time to pull the eggs"
        log.notice("ring stopped")
        let key = "surface|\\(id)"
        cache[key] = info["CFBundleVersion"]
    }
}
`;

const { sources, argumentNames } = appSources();
const lint = lintLiterals([...sources, { file: 'Planted.swift', source: PLANTED }], argumentNames);

test('a literal is words wherever it reaches a screen from, and nothing else is', () => {
  const failed = lint.failures.map((f) => /"(.*)" is words/.exec(f)?.[1]);
  assert.deepEqual(failed.sort(), [
    'Cool them in ice water', 'Done', 'Eggs are ready', 'Eggs in', 'Keep the lid on', 'Pull them out',
    'Stir them once', 'Take the pan off the heat', 'Time to pull the eggs',
  ]);
  assert.ok(lint.failures.every((f) => f.startsWith('Planted.swift: ')), lint.failures.join('\n'));
});

// The helpers are found, not listed. Each the hand-kept list once held is
// found by the same label or position, so the search has not gone blind;
// less the list's `spoken`, `shown` and `chosen`, which no call passes, and
// with MenuChoice's `choices`, which the list missed.
test('the app\'s text helpers are found in its sources', () => {
  const once: Record<string, (string | number)[]> = {
    request: ['title', 'body'], StepperValue: ['label'], StepperRow: ['label'], CountValue: ['label'],
    ListChoice: ['label'], MeasureField: ['label'], NudgeField: ['label', 'text'], MenuChoice: ['label', 'choices'],
    YolkSlider: ['label', 'valueText'], InfoButton: ['name'], InfoRow: ['name', 'more'], MoreText: [0],
    BarTitle: ['title'], barTitle: [0], linked: [0], para: [0], aside: [0], subhead: [0], footnote: [0],
    answerButton: [0], answerRow: [0], whiteButton: [0], warning: [0],
  };
  const missing = Object.entries(once).flatMap(([name, keys]) => keys
    .filter((key) => !(lint.helpers.get(name)?.has(key) ?? false)).map((key) => `${name}(${key})`));
  assert.deepEqual(missing, [], `not found to take text: ${missing.join(', ')}; found: ${
    [...lint.helpers].map(([n, k]) => `${n}(${[...k].join(', ')})`).join('; ')}`);
});
