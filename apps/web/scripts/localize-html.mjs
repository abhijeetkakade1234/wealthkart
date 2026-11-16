#!/usr/bin/env node
/**
 * After `next build` (ADR 0057): the root layout renders `<html lang="en">` for every page,
 * because a layout can't see the URL in a static export. This sets `lang="hi"` / `lang="mr"`
 * in the static HTML under `out/hi/` and `out/mr/`, so crawlers and screen readers get the
 * right language before any JavaScript runs. `LocaleEffects` keeps it right on client
 * navigation. Safe to run twice.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "out");
const LOCALES = ["hi", "mr"];

async function htmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return htmlFiles(p);
      return e.name.endsWith(".html") ? [p] : [];
    }),
  );
  return files.flat();
}

let changed = 0;
for (const locale of LOCALES) {
  const dir = join(OUT, locale);
  if (!existsSync(dir)) {
    console.error(`localize-html: ${dir} is missing; did next build run?`);
    process.exit(1);
  }
  for (const file of await htmlFiles(dir)) {
    const html = await readFile(file, "utf8");
    const next = html.replace(/<html([^>]*?)\slang="[^"]*"/, `<html$1 lang="${locale}"`);
    if (next !== html) {
      await writeFile(file, next);
      changed += 1;
    }
  }
}
console.log(`localize-html: set <html lang> on ${changed} file(s) in out/hi and out/mr`);
