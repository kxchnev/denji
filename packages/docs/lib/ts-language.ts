import { LRLanguage } from "@codemirror/language";
import { parser as jsParser } from "@lezer/javascript";

/** The grammar ships its own highlight props (`@external propSource`), so the
 *  bare Lezer parser is enough — no need for @codemirror/lang-javascript. */
export const tsLanguage = LRLanguage.define({
  parser: jsParser.configure({ dialect: "ts" }),
});
