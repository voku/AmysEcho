import { promises as fs } from 'fs';
import path from 'path';

(async () => {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const raw = await fs.readFile(pkgPath, 'utf8');
  const pkg = JSON.parse(raw);
  if (!pkg.scripts?.['build:android'] || !pkg.scripts['build:android'].includes('eas build')) {
    throw new Error('build:android script missing');
  }
  if (!pkg.scripts?.['build:ios'] || !pkg.scripts['build:ios'].includes('eas build')) {
    throw new Error('build:ios script missing');
  }
  console.log('build scripts ok');
})();
