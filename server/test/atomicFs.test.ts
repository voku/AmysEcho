import path from 'path';
import { promises as fs } from 'fs';
import { atomicWriteJson, atomicWriteBuffer } from '../src/utils/atomicFs.js';
import { DATA_DIR } from '../src/constants/modelPaths.js';

describe('atomicFs', () => {
  const target = path.join(DATA_DIR, 'atomic_test.json');
  const targetBin = path.join(DATA_DIR, 'atomic_test.bin');

  beforeAll(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
  });

  afterAll(async () => {
    try { await fs.unlink(target); } catch {}
    try { await fs.unlink(targetBin); } catch {}
    try { await fs.unlink(`${target}.tmp`); } catch {}
    try { await fs.unlink(`${targetBin}.tmp`); } catch {}
  });

  it('writes JSON atomically', async () => {
    await fs.writeFile(target, JSON.stringify({ v: 1 }), 'utf8');
    await atomicWriteJson(target, { v: 2 });
    const raw = await fs.readFile(target, 'utf8');
    expect(JSON.parse(raw).v).toBe(2);
  });

  it('preserves original on rename failure (JSON)', async () => {
    await fs.writeFile(target, JSON.stringify({ v: 3 }), 'utf8');
    const origRename = fs.rename;
    (fs as any).rename = jest.fn().mockRejectedValue(new Error('rename failed'));
    await expect(atomicWriteJson(target, { v: 4 })).rejects.toThrow();
    const raw = await fs.readFile(target, 'utf8');
    expect(JSON.parse(raw).v).toBe(3);
    // Cleanup tmp if left behind
    try { await fs.unlink(`${target}.tmp`); } catch {}
    (fs as any).rename = origRename;
  });

  it('writes Buffer atomically', async () => {
    await fs.writeFile(targetBin, Buffer.from('old'));
    await atomicWriteBuffer(targetBin, Buffer.from('new'));
    const buf = await fs.readFile(targetBin);
    expect(buf.toString()).toBe('new');
  });

  it('concurrent read sees old content until rename', async () => {
    await fs.writeFile(target, JSON.stringify({ v: 10 }), 'utf8');
    // Simulate write in progress: tmp present but not renamed
    await fs.writeFile(`${target}.tmp`, JSON.stringify({ v: 11 }), 'utf8');
    const raw = await fs.readFile(target, 'utf8');
    expect(JSON.parse(raw).v).toBe(10);
    // Cleanup
    await fs.unlink(`${target}.tmp`);
  });
});

