// Free TCP ports for isolated E2E runs and `pnpm dev:local` (ADR 0053).
// `node e2e/support/ports.mjs 4` prints that many free ports as a JSON array, so code that must
// stay synchronous (the Playwright config) can ask for ports through spawnSync.
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

/** One port the OS says is free on 127.0.0.1 right now. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** `n` distinct free ports. All are held open together so the OS can't hand one out twice. */
export async function findFreePorts(n) {
  const servers = [];
  try {
    for (let i = 0; i < n; i++) {
      const srv = createServer();
      srv.unref();
      await new Promise((resolve, reject) => {
        srv.on("error", reject);
        srv.listen(0, "127.0.0.1", resolve);
      });
      servers.push(srv);
    }
    return servers.map((s) => s.address().port);
  } finally {
    await Promise.all(servers.map((s) => new Promise((r) => s.close(() => r()))));
  }
}

/** True when nothing listens on `port` (127.0.0.1). */
export function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.unref();
    srv.once("error", () => resolve(false));
    srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(true)));
  });
}

/** `preferred` if it is free, else any free port. */
export async function portOr(preferred) {
  return (await isPortFree(preferred)) ? preferred : freePort();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const n = Number(process.argv[2] ?? 1);
  findFreePorts(n).then((ports) => process.stdout.write(JSON.stringify(ports)));
}
