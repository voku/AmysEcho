import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { once } from "node:events";

const routes = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/main.js", ["main.js", "text/javascript; charset=utf-8"]],
  ["/status.js", ["status.js", "text/javascript; charset=utf-8"]],
  ["/board.js", ["board.js", "text/javascript; charset=utf-8"]],
  ["/concepts.js", ["concepts.js", "text/javascript; charset=utf-8"]],
  ["/speech.js", ["speech.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/sw.js", ["sw.js", "text/javascript; charset=utf-8"]],
  ["/manifest.webmanifest", ["manifest.webmanifest", "application/manifest+json"]],
  ...["hilfe", "trinken", "pause", "mehr", "fertig", "app"].map((id) =>
    [`/icons/${id}.svg`, [`icons/${id}.svg`, "image/svg+xml"]]),
]);

const server = createServer(async (request, response) => {
  const entry = routes.get(request.url ?? "");
  if (entry === undefined) {
    response.writeHead(404);
    response.end();
    return;
  }
  try {
    const [path, type] = entry;
    const file = await readFile(new URL(`../dist/${path}`, import.meta.url));
    response.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    response.end(file);
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
  for (const route of routes.keys()) {
    const response = await fetch(`http://127.0.0.1:${address.port}${route}`);
    assert.equal(response.status, 200, `missing locally bundled asset: ${route}`);
    assert.ok((await response.text()).length > 0);
  }
  console.log("NG local bundle smoke OK; browser offline and actual speech are unverified");
} finally {
  server.close();
}
