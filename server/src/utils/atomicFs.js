import { promises as fs } from 'fs';

export async function atomicWriteJson(filePath, value) {
  const tmp = `${filePath}.tmp`;
  const data = JSON.stringify(value);
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, filePath);
}

export async function atomicWriteBuffer(filePath, buf) {
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, buf);
  await fs.rename(tmp, filePath);
}