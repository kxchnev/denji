/**
 * Regenerates `src/model/icon.data.ts` from the `simple-icons` package.
 *
 *   npm run -w power icons
 *
 * Path data is far too long to maintain by hand, and `simple-icons` is the only
 * large set with one consistent viewBox, an official brand colour per entry and
 * a clear licence (CC0). It stays a devDependency: the generated file is
 * committed, so the published package pulls in nothing at runtime.
 *
 * To add an icon, put its slug in SLUGS below and re-run.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as simpleIcons from "simple-icons";

/**
 * Curated for architecture diagrams. Note that AWS, Azure and the Oracle Java
 * logo are absent from simple-icons entirely — those companies asked to be
 * removed — so there is no slug to add. `openjdk` stands in for Java.
 */
const SLUGS = [
  // stores
  "postgresql", "mysql", "mariadb", "sqlite", "mongodb", "redis",
  "elasticsearch", "clickhouse", "apachecassandra", "neo4j", "minio",
  // messaging and processing
  "apachekafka", "rabbitmq", "natsdotio", "apachespark", "apacheairflow",
  // languages and runtimes
  "python", "typescript", "javascript", "nodedotjs", "go", "rust", "openjdk",
  "dotnet", "php", "ruby", "kotlin", "swift", "elixir", "scala",
  // frameworks
  "spring", "django", "fastapi", "express", "nestjs",
  // frontend
  "react", "vuedotjs", "angular", "nextdotjs", "svelte",
  // infrastructure
  "docker", "kubernetes", "helm", "nginx", "traefikproxy", "envoyproxy",
  "terraform", "consul", "vault", "cloudflare",
  // observability
  "prometheus", "grafana", "opentelemetry", "sentry",
  // platforms
  "googlecloud", "vercel", "keycloak",
  // misc
  "graphql", "github", "gitlab", "githubactions",
];

/** Shorthands people actually type. */
const ALIASES: Record<string, string> = {
  postgres: "postgresql",
  pg: "postgresql",
  mongo: "mongodb",
  cassandra: "apachecassandra",
  kafka: "apachekafka",
  nats: "natsdotio",
  spark: "apachespark",
  airflow: "apacheairflow",
  java: "openjdk",
  jvm: "openjdk",
  node: "nodedotjs",
  ts: "typescript",
  js: "javascript",
  golang: "go",
  csharp: "dotnet",
  vue: "vuedotjs",
  nextjs: "nextdotjs",
  next: "nextdotjs",
  k8s: "kubernetes",
  traefik: "traefikproxy",
  envoy: "envoyproxy",
  gcp: "googlecloud",
  otel: "opentelemetry",
  elastic: "elasticsearch",
};

/** Below this relative luminance a brand colour disappears on a dark surface. */
const DARK_LIMIT = 0.12;
/** Where such a colour is lifted to instead. */
const LIFTED_LIGHTNESS = 0.78;

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = parseInt(hex, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Lift a near-black brand colour to something visible on a dark background,
 * keeping its hue. Pure black has no hue, so it becomes plain light grey —
 * which is how black wordmarks are conventionally shown in dark mode anyway.
 */
function lighten(hex: string): string {
  const n = parseInt(hex, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const c = (1 - Math.abs(2 * LIFTED_LIGHTNESS - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = LIFTED_LIGHTNESS - c / 2;
  const seg = Math.floor(h / 60) % 6;
  const rgb = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][seg]!;
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(rgb[0]!)}${to(rgb[1]!)}${to(rgb[2]!)}`;
}

const key = (slug: string) => `si${slug.charAt(0).toUpperCase()}${slug.slice(1)}`;

interface SimpleIcon {
  title: string;
  slug: string;
  hex: string;
  path: string;
}

const registry = simpleIcons as unknown as Record<string, SimpleIcon | undefined>;

const rows: string[] = [];
const missing: string[] = [];

for (const slug of [...SLUGS].sort()) {
  const icon = registry[key(slug)];
  if (!icon) {
    missing.push(slug);
    continue;
  }
  const color = `#${icon.hex.toLowerCase()}`;
  const dark = luminance(icon.hex) < DARK_LIMIT ? lighten(icon.hex) : undefined;
  const fields = [
    `title: ${JSON.stringify(icon.title)}`,
    `color: "${color}"`,
    ...(dark ? [`darkColor: "${dark}"`] : []),
    `path: ${JSON.stringify(icon.path)}`,
  ];
  rows.push(`  ${slug}: { ${fields.join(", ")} },`);
}

if (missing.length > 0) {
  console.error(`unknown simple-icons slugs: ${missing.join(", ")}`);
  process.exit(1);
}

const aliases = Object.entries(ALIASES)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([from, to]) => {
    if (!SLUGS.includes(to)) throw new Error(`alias ${from} points at unlisted ${to}`);
    return `  ${from}: "${to}",`;
  });

const out = `// Generated by scripts/generate-icons.ts — do not edit by hand.
// Run \`npm run -w power icons\` after changing the slug list there.
//
// Artwork from Simple Icons (https://simpleicons.org), released under CC0.
// The logos themselves remain trademarks of their respective owners.
import type { Icon } from "./icon.js";

/** Brand marks bundled with the library, by Simple Icons slug. */
export const ICONS: Record<string, Icon> = {
${rows.join("\n")}
};

/** Shorthands that resolve to a bundled icon. */
export const ICON_ALIASES: Record<string, string> = {
${aliases.join("\n")}
};
`;

const target = fileURLToPath(new URL("../src/model/icon.data.ts", import.meta.url));
writeFileSync(target, out);
console.log(`wrote ${rows.length} icons and ${aliases.length} aliases`);
