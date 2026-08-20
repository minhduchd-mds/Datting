import { writeFileSync } from "node:fs";
import { allThemesCss } from "../dist/src/css.js";

const out = allThemesCss();
writeFileSync(new URL("../src/theme.css", import.meta.url), out);
console.log("theme.css:", out.split("\n").length, "dong");
