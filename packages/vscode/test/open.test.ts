/**
 * The trust boundary, on its own.
 *
 * `safeLink` is the host's second opinion about a URL the webview sent it. The
 * webview is bundled with the parser that refused everything but three schemes —
 * and is still not the thing that gets to decide, because a message is not a
 * document. `command:` is the one that makes this more than hygiene:
 * `env.openExternal` on a command URI runs the command.
 */
import assert from "node:assert/strict";
import { safeLink } from "../src/open.js";

const tests: Array<[string, () => void]> = [];
const test = (name: string, fn: () => void): void => {
  tests.push([name, fn]);
};

test("opens the three schemes a diagram may carry", () => {
  for (const ok of [
    "https://example.com/runbook",
    "http://localhost:3000/",
    "mailto:team@example.com",
    "https://example.com/a%29b?x=1#3fa",
  ]) {
    assert.ok(safeLink(ok), `${ok} is opened`);
  }
});

test("refuses everything else, whatever the webview claims", () => {
  for (const bad of [
    "command:workbench.action.terminal.new",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "vscode://ms-vscode.node-debug",
    "data:text/html,<script>1</script>",
    "//example.com",
    "not a url",
    "",
  ]) {
    assert.equal(safeLink(bad), null, `${bad} is refused`);
  }
});

let failures = 0;
console.log("open");
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
