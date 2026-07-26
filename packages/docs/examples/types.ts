export interface ExampleData {
  id: string;
  title: string;
  description?: string;
  /** Diagram source in the .pwr DSL — the live render is produced from this. */
  dsl: string;
  /** Equivalent programmatic API code (display only). */
  api: string;
}
