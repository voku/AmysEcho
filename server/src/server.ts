import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs';
import { TRAINED_MODEL_PATH } from './constants/modelPaths';
import {
  saveAnalyticsToFile,
  loadAnalyticsFromFile,
} from './services/analyticsService';
import portalRouter from './portal';

const app = express();
app.use(express.json());
app.use('/portal', portalRouter);

const API_TOKEN = process.env.API_TOKEN || 'secret';

function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization;
  if (header !== `Bearer ${API_TOKEN}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

function sanitize(text: string): string {
  return text.replace(/\d+/g, '');
}

app.post('/generate-suggestions', auth, async (req, res) => {
  const { input = '', context = [], language = 'English', age = 4 } = req.body || {};
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.json({ nextWords: [], caregiverPhrases: [] });
    return;
  }
  const clean = sanitize(input);
  const prompt = `A ${age}-year-old child who speaks ${language} just selected the word "${clean}". The current context is [${context.join(', ')}]. Provide likely next words and helpful phrases for a caregiver. Return a JSON object with two keys: "nextWords" and "caregiverPhrases".`;
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) throw new Error(String(response.status));
    const data: any = await response.json();
    const content = JSON.parse(data.choices[0].message.content as string);
    res.json(content);
  } catch (err) {
    console.error('LLM endpoint error:', err);
    res.status(500).json({ nextWords: [], caregiverPhrases: [] });
  }
});

app.post('/train-model', auth, async (req, res) => {
  const landmarks = req.body?.landmarks;
  if (!Array.isArray(landmarks)) {
    res.status(400).json({ error: 'Invalid landmarks' });
    return;
  }
  const tmp = path.join(process.cwd(), 'tmp_landmarks.json');
  await fs.writeFile(tmp, JSON.stringify(landmarks));
  try {
    await new Promise<void>((resolve, reject) => {
      const p = spawn('python3', [path.join(__dirname, 'train.py'), tmp], { stdio: 'inherit' });
      p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    });
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Training failed:', err);
    res.status(500).json({ error: 'Training failed' });
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
});

app.get('/latest-model', auth, async (_req, res) => {
  const file = TRAINED_MODEL_PATH;
  try {
    await fs.access(file);
    res.sendFile(file);
  } catch {
    res.status(404).json({ error: 'Model not found' });
  }
});

app.post('/analytics', auth, async (req, res) => {
  const { successRate7d, improvementTrend } = req.body || {};
  if (typeof successRate7d !== 'number' || typeof improvementTrend !== 'number') {
    res.status(400).json({ error: 'Invalid analytics' });
    return;
  }
  try {
    await saveAnalyticsToFile({
      id: 'default',
      successRate7d,
      improvementTrend,
    });
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Save analytics failed:', err);
    res.status(500).json({ error: 'Failed to save analytics' });
  }
});

app.get('/analytics', auth, async (_req, res) => {
  const data = await loadAnalyticsFromFile();
  if (!data) {
    res.status(404).json({ error: 'Analytics not found' });
    return;
  }
  res.json(data);
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 5000;
  app.listen(port, () => console.log(`Server running on ${port}`));
}

export default app;
