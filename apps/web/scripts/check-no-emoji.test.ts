// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("./check-no-emoji.mjs", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "wk-emoji-"));

function fixture(name: string, files: Record<string, string>) {
  const dir = join(root, name);
  mkdirSync(join(dir, "nested"), { recursive: true });
  for (const [file, content] of Object.entries(files)) writeFileSync(join(dir, file), content);
  return dir;
}

function run(dir: string) {
  return spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });
}

afterAll(() => rmSync(root, { recursive: true, force: true }));

// Built from code points so this test file itself stays emoji-free.
const PARTY = String.fromCodePoint(0x1f389);
const CHECK = String.fromCodePoint(0x2705);

describe("check-no-emoji", () => {
  it("S-UX-08 fails on a fixture containing an emoji", () => {
    const dir = fixture("bad", {
      "ok.ts": `export const a = "fine";\n`,
      "nested/toast.tsx": `export const msg = "Paid ${PARTY}";\nexport const ok = "${CHECK} done";\n`,
    });
    const result = run(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("U+1F389");
    expect(result.stderr).toContain("U+2705");
    expect(result.stderr).toMatch(/toast\.tsx:1:/);
  });

  it("S-UX-08 passes on clean code, including typography that is not emoji", () => {
    const dir = fixture("clean", {
      "page.tsx": `export const t = "Paying… · 0.50 AVAX – © WealthKart";\n`,
      "nested/util.ts": `export const x = 1;\n`,
      "notes.md": `${PARTY} markdown is not scanned\n`,
    });
    const result = run(dir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("no emoji found");
  });
});
