import express from 'express';

const API_TOKEN = process.env.API_TOKEN;
if (!API_TOKEN) {
  throw new Error('API_TOKEN environment variable must be set');
}

export function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization;
  if (header !== `Bearer ${API_TOKEN}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

export default auth;
