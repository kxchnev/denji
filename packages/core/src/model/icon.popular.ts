/**
 * The marks an architecture diagram actually reaches for, out of three and a
 * half thousand.
 *
 * Not a capability boundary — every Simple Icons slug resolves. This is a
 * starting vocabulary, for the three places that have to show *something*
 * before anyone has typed a character: `denji icons` with no query, the docs
 * gallery on first paint, and an empty `@icon(`. Sorted alphabetically the full
 * set opens on `1001tracklists`, which reads as a bug.
 *
 * It was the whole bundle until the set grew to all of them.
 */
export const POPULAR_ICONS: readonly string[] = [
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
