import request from 'supertest';
import { Express } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import jwt from 'jsonwebtoken';
import { registerSymbolRoutes } from '../src/routes/symbolRoutes.js';
import { setupDatabase, createDatabase } from '../src/db.js';
import express from 'express';

const JWT_SECRET = 'test-secret';

describe('symbol routes', () => {
  let app: Express;
  let tmpDbPath: string;
  let db: any;
  let token: string;

  beforeEach(async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'amy-symbol-test-'));
    tmpDbPath = path.join(tmpDir, 'db.json');
    db = await setupDatabase(tmpDbPath);
    
    app = express();
    app.use(express.json());
    
    // Mock auth middleware
    app.use((req, res, next) => {
      req.user = { userId: 'test-user', role: 'admin' };
      next();
    });

    registerSymbolRoutes(app, db);
    
    token = jwt.sign({ userId: 'test-user', role: 'admin' }, JWT_SECRET);
  });

  afterEach(async () => {
    try {
      await fs.rm(path.dirname(tmpDbPath), { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  });

  it('GET /api/v1/symbols returns default labels by default', async () => {
    const res = await request(app)
      .get('/api/v1/symbols')
      .expect(200);

    expect(res.body.symbols).toBeDefined();
    expect(res.body.symbols.length).toBe(12);
    
    const names = res.body.symbols.map((s: any) => s.name);
    expect(names).toContain('Alle');
    expect(names).toContain('Essen');
    
    // Check for new enriched fields
    const alle = res.body.symbols.find((s: any) => s.id === 'alle');
    expect(alle.emoji).toBe('👥');
    expect(alle.category).toBe('person');
    expect(alle.color).toBe('#94a3b8');
    expect(alle.sampleCount).toBeDefined();
    expect(alle.samplesNeeded).toBeDefined();
    expect(alle.status).toBeDefined();
  });

  it('GET /api/v1/symbols with profileId still returns default labels', async () => {
    const res = await request(app)
      .get('/api/v1/symbols?profileId=some-profile')
      .expect(200);

    expect(res.body.symbols.length).toBe(12);
    expect(res.body.symbols.some((s: any) => s.name === 'Alle')).toBe(true);
  });
});
