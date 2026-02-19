import type { ManifestEntry } from "../types.js";

const TRAILING_UUID_SUFFIX_PATTERN = /(?:[_-])[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function normalizeMergedLabel(rawLabel: string): string {
  const trimmed = rawLabel.trim();
  if (trimmed.length === 0) {
    return "";
  }

  return trimmed.replace(TRAILING_UUID_SUFFIX_PATTERN, "").trim();
}

export function mergeTrainedLabels(
  profileId: string,
  profileCounts: Record<string, number>,
  manifestEntries: ManifestEntry[],
): string[] {
  const normalizedLabelMap = new Map<string, string>();

  const addLabel = (rawLabel: string): void => {
    const normalizedLabel = normalizeMergedLabel(rawLabel);
    if (normalizedLabel.length === 0) {
      return;
    }

    const normalizedKey = normalizedLabel.toLocaleLowerCase("de-DE");
    if (!normalizedLabelMap.has(normalizedKey)) {
      normalizedLabelMap.set(normalizedKey, normalizedLabel);
    }
  };

  for (const [label, count] of Object.entries(profileCounts)) {
    if (count > 0) {
      addLabel(label);
    }
  }

  for (const entry of manifestEntries) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    if ((entry.profileId ?? null) !== profileId) {
      continue;
    }

    if (typeof entry.label !== "string") {
      continue;
    }

    addLabel(entry.label);
  }

  return Array.from(normalizedLabelMap.values());
}
