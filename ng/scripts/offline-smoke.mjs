import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { once } from "node:events";

// Loopback-only asset smoke: this does NOT claim a fully installed offline PWA.
const files = new Map([
  ["/", ["../dist/index.html", "text/html; charset=utf-8"]],
  ["/main.js", ["../dist/main.js", "text/javascript; charset=utf-8"]],
  ["/status.js", ["../dist/status.js", "text/javascript; charset=utf-8"]],
]);

const server = createServer(async (request, response) => {
  const file = files.get(request.url ?? "");
  if (!file) {
    response.writeHead(404);
    response.end();
    return;
  }

  const [path, type] = file;
  try {
    const content = await readFile(new URL(path, import.meta.url));
    response.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    response.end(content);
  } catch {
    response.writeHead(500);
    response.end();
  }
});

server.listen(0, "127.0.0.1");
try {
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  for (const route of files.keys()) {
    const response = await fetch(`http://127.0.0.1:${address.port}${route}`);
    assert.equal(response.status, 200, `missing local asset: ${route}`);
    assert.ok((await response.text()).length > 0);
  }
  console.log("NG local asset smoke passed (browser offline/PWA proof remains S1)");
} finally {
  server.close();
}
