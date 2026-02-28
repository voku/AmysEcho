import type { ManifestEntry } from "../types.js";

type CustomSignEntry = {
  id?: string;
  label?: string;
  emoji?: string | null;
  profileId?: string | null;
};

export type TrainedLabelDescriptor = {
  id: string;
  normalizedId: string;
  displayLabel: string;
  emoji: string | null;
  isCustom: boolean;
};

const TRAILING_UUID_SUFFIX_PATTERN = /(?:[_-])[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function normalizeMergedLabel(rawLabel: string): string {
  const trimmed = rawLabel.normalize("NFKC").trim().replace(/\s+/g, " ");
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

function normalizeSignKey(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE");
}

export function buildTrainedLabelDescriptors(
  profileId: string,
  trainedLabels: string[],
  customSigns: CustomSignEntry[],
): TrainedLabelDescriptor[] {
  const customById = new Map<string, CustomSignEntry>();
  const customByLabel = new Map<string, CustomSignEntry>();

  for (const sign of customSigns) {
    if (!sign || sign.profileId !== profileId || typeof sign.id !== "string") {
      continue;
    }

    const normalizedId = normalizeSignKey(sign.id);
    if (normalizedId.length > 0 && !customById.has(normalizedId)) {
      customById.set(normalizedId, sign);
    }

    if (typeof sign.label === "string") {
      const normalizedLabel = normalizeSignKey(sign.label);
      if (normalizedLabel.length > 0 && !customByLabel.has(normalizedLabel)) {
        customByLabel.set(normalizedLabel, sign);
      }
    }
  }

  return trainedLabels.map((label) => {
    const normalizedId = normalizeSignKey(label);
    const customSign = customById.get(normalizedId) ?? customByLabel.get(normalizedId);
    if (!customSign) {
      return {
        id: label,
        normalizedId,
        displayLabel: label,
        emoji: null,
        isCustom: false,
      };
    }

    return {
      id: label,
      normalizedId,
      displayLabel: typeof customSign.label === "string" && customSign.label.trim().length > 0
        ? customSign.label.trim()
        : label,
      emoji: typeof customSign.emoji === "string" && customSign.emoji.trim().length > 0 ? customSign.emoji.trim() : null,
      isCustom: true,
    };
  });
}
