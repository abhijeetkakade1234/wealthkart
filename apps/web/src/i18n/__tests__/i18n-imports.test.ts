import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { en } from "../en";
import { CORE_NAMESPACES } from "../registry";

const SRC = resolve(process.cwd(), "src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      return name === "i18n" || name === "__tests__" ? [] : files(p);
    }
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

function keys(node: unknown, prefix = ""): string[] {
  if (typeof node === "string") return [prefix];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
    keys(v, prefix ? `${prefix}.${k}` : k),
  );
}

const ALL_KEYS = keys(en);
const LAZY = Object.keys(en).filter((ns) => !(CORE_NAMESPACES as readonly string[]).includes(ns));
const KEY_LITERAL = new RegExp(`["'\`](${LAZY.join("|")})\\.([\\w.]*)`, "g");

/** A full key, or the start of one built in a template literal (`loans.status.${s}`). */
const isKey = (k: string) => ALL_KEYS.some((full) => full === k || full.startsWith(k));

describe("S-I18N-05 English namespaces ship with the screens that use them", () => {
  it("every file using a non-core key imports that namespace", () => {
    const missing: string[] = [];
    for (const f of files(SRC)) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(KEY_LITERAL)) {
        const [, ns, rest] = m;
        if (!isKey(`${ns}.${rest}`)) continue;
        if (!src.includes(`"@/i18n/en/${ns}"`)) {
          missing.push(`${relative(SRC, f)}: import "@/i18n/en/${ns}"`);
        }
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it("core namespaces exist and every lazy namespace registers itself", () => {
    for (const ns of CORE_NAMESPACES) expect(en).toHaveProperty(ns);
    for (const ns of LAZY) {
      const src = readFileSync(join(SRC, "i18n", "en", `${ns}.ts`), "utf8");
      expect(src, ns).toContain(`registerEn("${ns}", ${ns});`);
    }
  });
});
