import express, { Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const router = express.Router();

const DGS_SAMPLES_PATH = path.join(process.cwd(), 'server', 'data', 'dgs_samples.json');
const LABEL_MAP_PATH = path.join(process.cwd(), 'server', 'config', 'label-map.json');

// --- DGS Samples API ---

async function readSamples() {
    try {
        const data = await fs.readFile(DGS_SAMPLES_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return { samples: [] }; // Return empty if not found
        }
        throw error;
    }
}

async function writeSamples(data: any) {
    await fs.writeFile(DGS_SAMPLES_PATH, JSON.stringify(data, null, 2));
}

router.get('/dgs-samples', async (_req: Request, res: Response) => {
    try {
        const data = await readSamples();
        res.json(data.samples || []);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read samples file.' });
    }
});

router.delete('/dgs-samples/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const data = await readSamples();
        const initialLength = data.samples.length;
        data.samples = data.samples.filter((s: any) => s.id !== id);
        if (data.samples.length === initialLength) {
            return res.status(404).json({ error: 'Sample not found' });
        }
        await writeSamples(data);
        res.status(200).json({ status: 'ok' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update samples file.' });
    }
});

router.post('/retrain', (req: Request, res: Response) => {
    try {
        const trainProcess = spawn('npm', ['run', 'train:mlp', '--prefix', 'server'], { stdio: 'pipe' });
        const jobId = `train-${Date.now()}`;
        trainProcess.on('error', (err) => {
            console.error(`Failed to start training job ${jobId}:`, err);
        });
        res.status(202).json({ status: 'training_started', jobId });
    } catch (error) {
        res.status(500).json({ error: 'Failed to start training process.' });
    }
});

// --- Label Map API ---

router.get('/label-map', async (_req: Request, res: Response) => {
    try {
        const data = await fs.readFile(LABEL_MAP_PATH, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return res.json({ synonyms: {} });
        }
        res.status(500).json({ error: 'Failed to read label map.' });
    }
});

router.post('/label-map', async (req: Request, res: Response) => {
    try {
        const { synonyms } = req.body;
        if (typeof synonyms !== 'object' || synonyms === null) {
            return res.status(400).json({ error: 'Invalid synonyms format.' });
        }
        await fs.writeFile(LABEL_MAP_PATH, JSON.stringify({ synonyms }, null, 2));
        res.status(200).json({ status: 'ok' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to write label map.' });
    }
});

export default router;
