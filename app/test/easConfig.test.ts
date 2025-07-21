import { promises as fs } from 'fs';
import path from 'path';

(async () => {
  const configPath = path.join(__dirname, '..', 'eas.json');
  const raw = await fs.readFile(configPath, 'utf8');
  try {
    JSON.parse(raw);
    console.log('eas config ok');
  } catch {
    throw new Error('eas.json is not valid JSON');
  }
})();
