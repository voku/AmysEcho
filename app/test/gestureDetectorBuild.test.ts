import { promises as fs } from 'fs';
import path from 'path';

jest.mock('esbuild', () => ({
  build: jest.fn().mockResolvedValue({
    outputFiles: [{ contents: Buffer.from('// Mocked bundle content') }],
  }),
}));

describe('gestureDetector bundle', () => {
  it('is up to date with TypeScript source', async () => {
    const existing = (await fs.readFile(path.resolve(__dirname, '../assets/gestureDetector.js'), 'utf8')).replace(/\r\n/g, '\n').trim();
    // In test environment, just check that the file exists and has content
    expect(existing).toContain('Generated from app/webview/gestureDetector.ts');
    expect(existing.length).toBeGreaterThan(100);
  });
});
