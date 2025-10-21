#!/usr/bin/env node
import { DEFAULT_BASELINE_LABELS } from '../services/mlpModelArtifacts.js';

const payload = {
  DEFAULT_BASELINE_LABELS,
};

process.stdout.write(`${JSON.stringify(payload)}\n`);
