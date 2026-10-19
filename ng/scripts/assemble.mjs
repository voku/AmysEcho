import { copyFile } from "node:fs/promises";

await copyFile(
  new URL("../public/index.html", import.meta.url),
  new URL("../dist/index.html", import.meta.url),
);
