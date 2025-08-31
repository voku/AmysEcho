import { build } from 'esbuild';
import { promises as fs } from 'fs';
import path from 'path';

describe('gestureDetector bundle', () => {
  it('is up to date with TypeScript source', async () => {
    const banner =
      '// Generated from app/webview/gestureDetector.ts; run npm run build:webview --prefix app';
    const result = await build({
      entryPoints: [path.resolve(__dirname, '../webview/gestureDetector.ts')],
      bundle: true,
      format: 'iife',
      banner: { js: banner },
      write: false,
    });
    const built = Buffer.from(result.outputFiles[0].contents).toString('utf8').trim();
    const existing = await fs.readFile(path.resolve(__dirname, '../assets/gestureDetector.js'), 'utf8');
    expect(built).toBe(existing.trim());
  });
});
