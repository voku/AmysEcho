import defaultBaselineLabels from '../../assets/config/defaultBaselineLabels.json';

if (!Array.isArray(defaultBaselineLabels)) {
  throw new Error('defaultBaselineLabels.json muss ein Array enthalten');
}

export const DEFAULT_BASELINE_LABELS = Object.freeze(
  (defaultBaselineLabels as string[]).map((label) => String(label)),
);
