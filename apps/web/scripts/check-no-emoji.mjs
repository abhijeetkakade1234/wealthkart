#!/usr/bin/env node
/**
 * No emojis anywhere in the UI (ADR 0026, docs/ui.md §9, scenario S-UX-08).
 *
 * Scans .ts/.tsx files for emoji code points and exits 1 if any are found.
 * Usage: node scripts/check-no-emoji.mjs [dir ...]   (default: src)
 *
 * Allowed: (c), (r) and TM signs, which Unicode also tags as pictographic but which
 * are ordinary typography. Punctuation such as the ellipsis, middle dot and en dash
 * is not emoji and is not flagged.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXTENSIONS = [".ts", ".tsx"];
const SKIP_DIRS = new Set(["node_modules", ".next", "out", "coverage", ".turbo"]);
const ALLOWED = new Set([0x00a9, 0x00ae, 0x2122]);

// Pictographic emoji, regional-indicator flags, and the emoji presentation selector.
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}]/gu;

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(join(dir, entry.name));
    } else if (EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      yield join(dir, entry.name);
    }
  }
}

/** Returns every emoji found under the given directories (or files). */
export function findEmoji(paths) {
  const hits = [];
  for (const p of paths) {
    const files = statSync(p).isDirectory() ? walk(p) : [p];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        for (const match of line.matchAll(EMOJI)) {
          const cp = match[0].codePointAt(0);
          if (ALLOWED.has(cp)) continue;
          hits.push({
            file,
            line: i + 1,
            column: match.index + 1,
            codePoint: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
          });
        }
      });
    }
  }
  return hits;
}

function main() {
  const args = process.argv.slice(2);
  const targets = (args.length > 0 ? args : ["src"]).map((p) => resolve(process.cwd(), p));
  const hits = findEmoji(targets);
  if (hits.length === 0) {
    console.log("check-no-emoji: no emoji found.");
    return 0;
  }
  console.error(`check-no-emoji: found ${hits.length} emoji (ADR 0026: icons only, no emojis):`);
  for (const h of hits) {
    console.error(`  ${relative(process.cwd(), h.file)}:${h.line}:${h.column}  ${h.codePoint}`);
  }
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
