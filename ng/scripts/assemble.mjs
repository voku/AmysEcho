import { cp } from "node:fs/promises";

// Include every local SVG/style/manifest/service-worker asset in production output.
await cp(
  new URL("../public/", import.meta.url),
  new URL("../dist/", import.meta.url),
  { recursive: true },
);
