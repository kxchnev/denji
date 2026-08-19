/**
 * Live preview for a `.denji` file.
 *
 * The workflow this serves: a model edits the file, a person watches the picture
 * and says what to change. So the page has to survive a document that is broken
 * for a moment — a model rewrites a file in whole passes, and half of those
 * passes do not parse. On a bad read the last good drawing stays on screen and
 * the error is reported over it, rather than the preview blanking on every save.
 */
import { spawn } from "node:child_process";
import { readFileSync, watch as fsWatch, type FSWatcher } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { basename, dirname, resolve } from "node:path";
import { NAME } from "./brand.js";
import { parseArchitecture } from "./dsl/arch-parse.js";
import { DiagramParseError } from "./dsl/error.js";
import { layoutArchitecture } from "./layout/arch/index.js";
import { renderArchitecture } from "./render/arch-svg.js";
import { registeredFonts } from "./resources.js";
import type { ThemeName } from "./model/arch.js";

/** Editors write, rename and chmod in a burst; one render per burst is enough. */
const DEBOUNCE_MS = 60;
const PORTS_TO_TRY = 20;

interface Payload {
  svg: string | null;
  error: { message: string; line: number | null; col: number | null } | null;
}

function render(file: string, theme: ThemeName | undefined): Payload {
  let source: string;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    return { svg: null, error: { message: `cannot read ${basename(file)}`, line: null, col: null } };
  }
  try {
    const diagram = parseArchitecture(source);
    // Warnings belong to `denji check`, which the model runs; a person looking
    // at the picture judges it by looking at it.
    layoutArchitecture(diagram, { onWarn: () => {} });
    const svg = renderArchitecture(
      diagram,
      // `auto` carries both palettes and switches on the reader's own device
      // setting, so the page needs no theme logic at all. `--theme` pins one.
      theme ? { theme, themeMode: "fixed" } : { themeMode: "auto" },
    );
    return { svg, error: null };
  } catch (err) {
    if (err instanceof DiagramParseError) {
      return { svg: null, error: { message: err.reason, line: err.line, col: err.col } };
    }
    return { svg: null, error: { message: (err as Error).message, line: null, col: null } };
  }
}

/**
 * The subsets of the shipped face, as this server will hand them out.
 *
 * Taken from the registry rather than from disk: the CLI has already put the
 * bytes there, and a preview that fetched its own copy could differ from the one
 * the export embeds. Empty when nobody registered a font — the page then falls
 * back to the system stack, which is what it always did.
 */
interface ServedFont {
  url: string;
  bytes: Uint8Array;
  family: string;
  unicodeRange?: string | undefined;
}

function servedFonts(): ServedFont[] {
  const out: ServedFont[] = [];
  for (const font of registeredFonts()) {
    for (const web of font.web ?? []) {
      out.push({
        url: `/font/${out.length}.woff2`,
        bytes: web.woff2,
        family: font.family,
        unicodeRange: web.unicodeRange,
      });
    }
  }
  return out;
}

/**
 * `@font-face` for the preview, for the same reason the docs site and the editor
 * carry one: a rendered diagram asks for Inter first, and the export draws in
 * Inter for certain. Without this the page shows one picture and `denji render`
 * writes another — the labels differ, and that is the one thing this preview is
 * for.
 */
const fontFaces = (fonts: readonly ServedFont[]): string =>
  fonts
    .map(
      (f) =>
        `  @font-face { font-family: '${f.family}'; font-style: normal; font-weight: 400; ` +
        `font-display: swap; ` +
        (f.unicodeRange ? `unicode-range: ${f.unicodeRange}; ` : "") +
        `src: url(${f.url}) format('woff2'); }`,
    )
    .join("\n");

const page = (faces: string): string => `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${NAME} preview</title>
<style>
${faces}
  :root { color-scheme: light dark; --bg: #f8fafc; --fg: #0f172a; --err-bg: #fef2f2; --err-fg: #b91c1c; --err-bd: #fecaca; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0b1120; --fg: #e2e8f0; --err-bg: #2a1215; --err-fg: #fca5a5; --err-bd: #7f1d1d; }
  }
  html, body { height: 100%; margin: 0; }
  body { background: var(--bg); color: var(--fg); display: flex; align-items: center; justify-content: center;
         font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; overflow: hidden; }
  #stage { max-width: 100%; max-height: 100%; padding: 24px; box-sizing: border-box; display: flex;
           align-items: center; justify-content: center; }
  #stage svg { max-width: 100%; max-height: calc(100vh - 48px); width: auto; height: auto; }
  #err { position: fixed; left: 12px; right: 12px; top: 12px; padding: 8px 12px; border-radius: 6px;
         background: var(--err-bg); color: var(--err-fg); border: 1px solid var(--err-bd);
         white-space: pre-wrap; display: none; }
  #off { position: fixed; right: 12px; bottom: 12px; opacity: .6; display: none; }
  #empty { opacity: .5; }
</style>
<div id="err"></div>
<div id="stage"><span id="empty">waiting for the first render…</span></div>
<div id="off">disconnected — retrying…</div>
<script>
  var stage = document.getElementById('stage');
  var err = document.getElementById('err');
  var off = document.getElementById('off');
  var es = new EventSource('/events');
  es.onmessage = function (e) {
    var d = JSON.parse(e.data);
    off.style.display = 'none';
    if (d.svg) {
      // Only replace the drawing when there is a new one: on a parse error the
      // previous render stays put, so the picture never blanks mid-edit.
      stage.innerHTML = d.svg;
    }
    if (d.error) {
      var at = d.error.line ? ' (line ' + d.error.line + ':' + d.error.col + ')' : '';
      err.textContent = d.error.message + at;
      err.style.display = 'block';
    } else {
      err.style.display = 'none';
    }
  };
  // EventSource reconnects on its own; this only tells the reader why the
  // picture stopped moving (usually: the watch process was stopped).
  es.onerror = function () { off.style.display = 'block'; };
</script>
`;

export interface WatchOptions {
  port: number;
  theme?: ThemeName;
  open: boolean;
}

export async function watchDiagram(input: string, opts: WatchOptions): Promise<void> {
  const file = resolve(input);
  const clients = new Set<ServerResponse>();
  const fonts = servedFonts();
  const PAGE = page(fontFaces(fonts));
  let latest = render(file, opts.theme);

  const push = (): void => {
    const line = `data: ${JSON.stringify(latest)}\n\n`;
    for (const c of clients) c.write(line);
  };

  let timer: NodeJS.Timeout | null = null;
  const onChange = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const next = render(file, opts.theme);
      // Keep the last drawing that parsed; only the error is new.
      latest = { svg: next.svg ?? latest.svg, error: next.error };
      push();
    }, DEBOUNCE_MS);
  };

  // Watch the directory, not the file. Most editors save by writing a temp file
  // and renaming it over the target, which destroys the inode a file watcher is
  // bound to — the preview would then freeze after the very first save, and
  // silently. A directory handle survives that.
  const watcher: FSWatcher = fsWatch(dirname(file), (_event, name) => {
    if (name === null || basename(name) === basename(file)) onChange();
  });

  const server = createServer((req, res) => {
    if (req.url === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      clients.add(res);
      res.write(`data: ${JSON.stringify(latest)}\n\n`);
      req.on("close", () => clients.delete(res));
      return;
    }
    const font = fonts.find((f) => f.url === req.url);
    if (font) {
      // Immutable: the file cannot change while this process is alive, and a
      // preview reloads on every save.
      res.writeHead(200, {
        "Content-Type": "font/woff2",
        "Cache-Control": "public, max-age=31536000, immutable",
      });
      res.end(Buffer.from(font.bytes));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(PAGE);
  });

  const port = await listen(server, opts.port);
  const url = `http://localhost:${port}`;
  console.log(`${NAME}: watching ${input}`);
  console.log(`${NAME}: preview at ${url}`);
  if (opts.open) openBrowser(url);

  const stop = (): void => {
    watcher.close();
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

/** Take the requested port, or the next free one — a second preview should not
 *  fail just because the first is still up. */
function listen(server: ReturnType<typeof createServer>, first: number): Promise<number> {
  return new Promise((resolvePort, reject) => {
    let port = first;
    const attempt = (): void => {
      server.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && port < first + PORTS_TO_TRY) {
          port++;
          attempt();
        } else {
          reject(err);
        }
      });
      server.listen(port, () => resolvePort(port));
    };
    attempt();
  });
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [url], { detached: true, stdio: "ignore", shell: process.platform === "win32" })
      .on("error", () => {})
      .unref();
  } catch {
    // Headless box, or no browser — the URL is on stdout either way.
  }
}
