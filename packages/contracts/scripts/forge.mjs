#!/usr/bin/env node
/**
 * Runs `forge` with the given args, finding it even when it isn't on PATH
 * (e.g. installed to a custom FOUNDRY_DIR such as D:\tools\foundry on Windows).
 * Order: $FOUNDRY_DIR/bin, ~/.foundry/bin, then plain `forge` from PATH.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const exe = process.platform === "win32" ? "forge.exe" : "forge";
const dirs = [process.env.FOUNDRY_DIR, join(homedir(), ".foundry")].filter(Boolean);

let bin = "forge";
for (const dir of dirs) {
  // Git Bash may hand us a POSIX path like /d/tools/foundry
  const normalized =
    process.platform === "win32" && /^\/[a-zA-Z]\//.test(dir) ? `${dir[1]}:${dir.slice(2)}` : dir;
  const candidate = join(normalized, "bin", exe);
  if (existsSync(candidate)) {
    bin = candidate;
    break;
  }
}

const result = spawnSync(bin, process.argv.slice(2), { stdio: "inherit" });
if (result.error) {
  console.error(
    `Could not run forge (${result.error.message}). Install Foundry or set FOUNDRY_DIR to its folder.`,
  );
  process.exit(1);
}
process.exit(result.status ?? 1);
