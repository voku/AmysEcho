import { DEFAULT_BASELINE_LABELS } from '../constants/defaultBaselineLabels.js';
import { BASELINE_MLP_MODEL_PATH } from '../constants/modelPaths.js';

const payload = {
  DEFAULT_BASELINE_LABELS,
  BASELINE_MLP_MODEL_PATH,
};

process.stdout.write(`${JSON.stringify(payload)}\n`);
