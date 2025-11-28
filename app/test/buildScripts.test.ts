import { promises as fs } from 'fs';
import path from 'path';

describe('Build Scripts', () => {
  it('should contain the correct build scripts', async () => {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const raw = await fs.readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw);
    expect(pkg.scripts?.['build:android']).toBeDefined();
    expect(pkg.scripts['build:android']).toContain('eas build');
    expect(pkg.scripts?.['build:ios']).toBeDefined();
    expect(pkg.scripts['build:ios']).toContain('eas build');
  });
});