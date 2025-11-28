import { promises as fs } from 'fs';
import path from 'path';

describe('EAS Config', () => {
  it('should be a valid JSON file', async () => {
    const configPath = path.join(__dirname, '..', 'eas.json');
    const raw = await fs.readFile(configPath, 'utf8');
    let isJson = true;
    try {
      JSON.parse(raw);
    } catch {
      isJson = false;
    }
    expect(isJson).toBe(true);
  });
});