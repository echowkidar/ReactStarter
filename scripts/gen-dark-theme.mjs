// Generates client/src/dark-theme.css — the screen-only dark mode overrides.
//
// The app uses many fixed Tailwind colours (bg-white, text-gray-700, bg-green-50 …),
// which do not follow the theme variables. This script scans client/src for those
// class names and writes a matching dark override for each one that is used.
// Every rule is inside `@media screen`, so printouts keep the normal light look.
//
// Run again after adding new colour classes:  node scripts/gen-dark-theme.mjs

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const palette = require("tailwindcss/colors");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "client", "src");
const OUT = path.join(SRC, "dark-theme.css");

const NEUTRAL = ["slate", "gray", "zinc", "neutral", "stone"];
const COLORED = ["red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose"];

// Dark surfaces
const CARD = "#131c2e";
const NEUTRAL_BG = { white: CARD, 50: "#0f1726", 100: "#1b2538", 200: "#26324a", 300: "#334158" };
const NEUTRAL_TEXT = { black: "#f1f5f9", 950: "#f1f5f9", 900: "#f1f5f9", 800: "#e8edf4", 700: "#dbe3ee", 600: "#c3cddb", 500: "#94a3b8", 400: "#7c8aa0" };
const NEUTRAL_BORDER = { white: "#263247", 50: "#263247", 100: "#263247", 200: "#2c3850", 300: "#38465f", 400: "#4b5b75" };
const COLORED_BG_MIX = { 50: 12, 100: 20, 200: 30, 300: 42 };
const COLORED_TEXT = { 500: 400, 600: 400, 700: 400, 800: 300, 900: 300, 950: 200 };
const COLORED_BORDER_MIX = { 50: 25, 100: 30, 200: 38, 300: 50 };

const mix = (c, pct) => `color-mix(in srgb, ${c} ${pct}%, ${CARD})`;
const withAlpha = (c, a) => (a == null ? c : `color-mix(in srgb, ${c} ${a}%, transparent)`);

/** Dark colour for a utility, or null when it should stay as it is. */
function darkColour(kind, name, shade) {
  const isNeutral = name === "white" || name === "black" || NEUTRAL.includes(name);
  const key = name === "white" || name === "black" ? name : Number(shade);
  if (kind === "bg" || kind === "from" || kind === "via" || kind === "to") {
    if (isNeutral) return NEUTRAL_BG[key] ?? null;
    return COLORED_BG_MIX[key] != null ? mix(palette[name][500], COLORED_BG_MIX[key]) : null;
  }
  if (kind === "text") {
    if (isNeutral) return NEUTRAL_TEXT[key] ?? null;
    return COLORED_TEXT[key] != null ? palette[name][COLORED_TEXT[key]] : null;
  }
  if (kind === "border" || kind === "divide") {
    if (isNeutral) return NEUTRAL_BORDER[key] ?? null;
    return COLORED_BORDER_MIX[key] != null ? mix(palette[name][500], COLORED_BORDER_MIX[key]) : null;
  }
  return null;
}

// ---- scan the source for colour classes -----------------------------------
const families = ["white", "black", ...NEUTRAL, ...COLORED].join("|");
const TOKEN = new RegExp(
  String.raw`(?<![\w-])((?:[\w\-\[\]=()&.]+:)*)(bg|text|border|border-[trblxy]|from|via|to|divide)-(${families})(?:-(\d{2,3}))?(?:\/(\d{1,3}))?(?![\w-])`,
  "g",
);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

const tokens = new Map();
for (const file of walk(SRC)) {
  const text = fs.readFileSync(file, "utf8");
  for (const m of text.matchAll(TOKEN)) {
    const [full, prefix, kindRaw, name, shade, alpha] = m;
    if ((name === "white" || name === "black") && shade) continue;
    if (!(name === "white" || name === "black") && !shade) continue;
    const variants = prefix ? prefix.slice(0, -1).split(":") : [];
    if (variants.some((v) => v === "print" || v === "dark")) continue;
    tokens.set(full, { variants, kindRaw, name, shade, alpha: alpha ? Number(alpha) : null });
  }
}

// ---- build rules --------------------------------------------------------------
const STATE = { hover: ":hover", focus: ":focus", "focus-visible": ":focus-visible", active: ":active", disabled: ":disabled" };

function selectorFor(token, variants) {
  let sel = `[class~="${token}"]`;
  let groupPrefix = "";
  for (const v of variants) {
    if (STATE[v]) sel += STATE[v];
    else if (v === "group-hover") groupPrefix = ".group:hover ";
    else if (/^data-\[(.+)\]$/.test(v)) sel += `[data-${v.slice(6, -1).replace(/=(.*)$/, '="$1"')}]`;
    else if (v === "odd") sel += ":nth-child(odd)";
    else if (v === "even") sel += ":nth-child(even)";
    else if (v === "first") sel += ":first-child";
    else if (v === "last") sel += ":last-child";
    // responsive / supports-* / other variants: apply always (dark either way)
  }
  return `html.app-dark ${groupPrefix}${sel}`;
}

const order = { bg: 0, text: 1, border: 2, divide: 3, from: 4, via: 5, to: 6 };
const rules = [];
for (const [token, t] of tokens) {
  const kind = t.kindRaw.startsWith("border") ? "border" : t.kindRaw;
  const colour = darkColour(kind, t.name, t.shade);
  if (!colour) continue;
  const c = withAlpha(colour, t.alpha);
  const sel = selectorFor(token, t.variants);
  let body;
  switch (t.kindRaw) {
    case "bg": body = `background-color: ${c};`; break;
    case "text": body = `color: ${c};`; break;
    case "border": body = `border-color: ${c};`; break;
    case "border-t": body = `border-top-color: ${c};`; break;
    case "border-b": body = `border-bottom-color: ${c};`; break;
    case "border-l": body = `border-left-color: ${c};`; break;
    case "border-r": body = `border-right-color: ${c};`; break;
    case "border-x": body = `border-left-color: ${c}; border-right-color: ${c};`; break;
    case "border-y": body = `border-top-color: ${c}; border-bottom-color: ${c};`; break;
    case "divide":
      rules.push({ o: order.divide, v: t.variants.length, css: `${sel} > :not([hidden]) ~ :not([hidden]) { border-color: ${c}; }` });
      continue;
    case "from":
      body = `--tw-gradient-from: ${c} var(--tw-gradient-from-position); --tw-gradient-to: transparent var(--tw-gradient-to-position); --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to);`;
      break;
    case "via":
      body = `--tw-gradient-to: transparent var(--tw-gradient-to-position); --tw-gradient-stops: var(--tw-gradient-from), ${c} var(--tw-gradient-via-position), var(--tw-gradient-to);`;
      break;
    case "to": body = `--tw-gradient-to: ${c} var(--tw-gradient-to-position);`; break;
    default: continue;
  }
  rules.push({ o: order[kind] ?? order[t.kindRaw], v: t.variants.length, css: `${sel} { ${body} }` });
}
// plain rules first, state variants after (so hover etc. win), and from → via → to
rules.sort((a, b) => a.v - b.v || a.o - b.o || a.css.localeCompare(b.css));

const header = `/* AUTO-GENERATED by scripts/gen-dark-theme.mjs — do not edit by hand.
   Dark mode for fixed Tailwind colours. Screen only: printouts are never affected. */
`;
fs.writeFileSync(OUT, `${header}@media screen {\n${rules.map((r) => "  " + r.css).join("\n")}\n}\n`);
console.log(`dark-theme.css: ${rules.length} rules from ${tokens.size} colour classes`);
