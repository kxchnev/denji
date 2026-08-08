/**
 * What a drop turns into, on the host side.
 *
 * The point of the line diff is that a drag must not disturb anything but the
 * coordinates: replacing the whole document would work, and would also move the
 * author's cursor and collapse their folded regions. These tests pin the
 * property that makes the narrow edit safe — `setNodePositions` never changes
 * how many lines a document has.
 */
import assert from "node:assert/strict";
import { setNodePositions } from "power";
import { changedLines } from "../src/diff.js";

const tests: Array<[string, () => void]> = [];
const test = (name: string, fn: () => void): void => {
  tests.push([name, fn]);
};

const SOURCE = `architecture
  service orders "Orders" {
    app api "API"
    database db "Postgres" @below(api)
  }
  app client "Client" @below(orders)
`;

test("reports only the lines a move rewrote", () => {
  const after = setNodePositions(SOURCE, [{ id: "client", at: { x: 40, y: 200 } }])!;
  const lines = changedLines(SOURCE, after);
  assert.ok(lines);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]![0], 5, "the line `client` is declared on, 0-based");
  assert.equal(lines[0]![1], '  app client "Client" @at(40, 200)');
});

test("reports one line per node when a drag freezes the whole document", () => {
  const moves = [
    { id: "api", at: { x: 0, y: 0 } },
    { id: "db", at: { x: 0, y: 80 } },
    { id: "orders", at: { x: 0, y: 0 } },
    { id: "client", at: { x: 40, y: 200 } },
  ];
  const after = setNodePositions(SOURCE, moves)!;
  const lines = changedLines(SOURCE, after);
  assert.ok(lines);
  assert.deepEqual(
    lines.map(([i]) => i),
    [1, 2, 3, 5],
  );
  // The lines the drag did not touch are not in the edit at all — which is what
  // keeps the cursor and the folded regions where the author left them.
  assert.ok(!lines.some(([i]) => i === 0 || i === 4));
});

test("hands back a CRLF line without its carriage return", () => {
  const crlf = SOURCE.replace(/\n/g, "\r\n");
  const after = setNodePositions(crlf, [{ id: "client", at: { x: 8, y: 8 } }])!;
  const lines = changedLines(crlf, after);
  assert.ok(lines);
  assert.equal(lines.length, 1);
  assert.ok(!lines[0]![1].includes("\r"), "a TextLine range stops before the break");
  assert.equal(lines[0]![1], '  app client "Client" @at(8, 8)');
});

test("gives up — asking for a whole-document replace — if the line count moved", () => {
  assert.equal(changedLines("a\nb\n", "a\nb\nc\n"), null);
});

test("finds nothing to do when the move changed nothing", () => {
  const pinned = setNodePositions(SOURCE, [{ id: "client", at: { x: 40, y: 200 } }])!;
  const again = setNodePositions(pinned, [{ id: "client", at: { x: 40, y: 200 } }])!;
  assert.deepEqual(changedLines(pinned, again), []);
});

let failures = 0;
console.log("diff");
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.error(`  ✗ ${name}\n    ${(e as Error).message}`);
  }
}
if (failures > 0) {
  console.error(`\n${failures} failing`);
  process.exitCode = 1;
} else {
  console.log(`\n${tests.length} passing`);
}
