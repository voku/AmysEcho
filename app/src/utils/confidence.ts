export const normalizeConfidence = (value: unknown): number | null => {
  if (typeof value !== 'number') {
    return null;
  }

  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return null;
  }

  const clamped = Math.min(1, Math.max(0, value));
  if (!Number.isFinite(clamped) || Number.isNaN(clamped)) {
    return null;
  }

  return clamped;
};

export const formatConfidencePercentage = (confidence: number): string => {
  return `${Math.round(confidence * 100)}%`;
};
