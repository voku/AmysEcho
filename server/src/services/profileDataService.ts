import { promises as fs } from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { createHash } from 'crypto';
import { atomicWriteJson } from '../utils/atomicFs.js';
import {
  DATA_DIR,
  TRAINING_MANIFEST_PATH,
  TRAINING_UPLOADS_DIR,
  TRAINING_DATASETS_DIR,
  MLP_MODELS_DIR,
} from '../constants/modelPaths.js';
import { PROFILE_BACKUPS_DIR } from '../constants/profileRegistryPaths.js';
import type { Database } from '../db.js';
import type { ProfileRecord, ProfileRegistry } from './profileRegistry.js';

type TrainingManifestEntry = {
  profileId?: string | null;
  [key: string]: unknown;
};

type TrainingManifestFile = {
  entries: TrainingManifestEntry[];
};

type DgsSampleEntry = {
  profileId?: string | null;
  [key: string]: unknown;
};

type DgsSamplesFile = {
  samples: DgsSampleEntry[];
};

type CustomSignEntry = {
  profileId?: string | null;
  [key: string]: unknown;
};

type CustomSignsFile = {
  signs: CustomSignEntry[];
};

export type ProfileExportPayload = {
  exportedAt: string;
  profile: ProfileRecord;
  dbProfile: Database['profiles'][number] | null;
  usageStats: Database['usageStats'];
  corrections: Database['corrections'];
  trainingManifest: TrainingManifestFile;
  dgsSamples: DgsSamplesFile;
  customSigns: CustomSignsFile;
};

async function loadJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function loadTrainingManifest(): Promise<TrainingManifestFile> {
  return loadJsonFile(TRAINING_MANIFEST_PATH, { entries: [] });
}

export async function saveTrainingManifest(manifest: TrainingManifestFile): Promise<void> {
  await ensureDir(path.dirname(TRAINING_MANIFEST_PATH));
  await atomicWriteJson(TRAINING_MANIFEST_PATH, manifest);
}

export async function loadDgsSamples(): Promise<DgsSamplesFile> {
  const filePath = path.join(DATA_DIR, 'dgs_samples.json');
  return loadJsonFile(filePath, { samples: [] });
}

export async function saveDgsSamples(samples: DgsSamplesFile): Promise<void> {
  const filePath = path.join(DATA_DIR, 'dgs_samples.json');
  await ensureDir(path.dirname(filePath));
  await atomicWriteJson(filePath, samples);
}

export async function loadCustomSigns(): Promise<CustomSignsFile> {
  const filePath = path.join(TRAINING_DATASETS_DIR, 'custom_signs.json');
  return loadJsonFile(filePath, { signs: [] });
}

export async function saveCustomSigns(signs: CustomSignsFile): Promise<void> {
  const filePath = path.join(TRAINING_DATASETS_DIR, 'custom_signs.json');
  await ensureDir(path.dirname(filePath));
  await atomicWriteJson(filePath, signs);
}

export function filterManifestForProfile(
  manifest: TrainingManifestFile,
  profileId: string,
): TrainingManifestFile {
  return {
    entries: manifest.entries.filter((entry) => entry.profileId === profileId),
  };
}

export function filterSamplesForProfile(
  data: DgsSamplesFile,
  profileId: string,
): DgsSamplesFile {
  return {
    samples: data.samples.filter((sample) => sample.profileId === profileId),
  };
}

export async function deleteProfileTrainingData(profileId: string): Promise<void> {
  const manifest = await loadTrainingManifest();
  const remainingEntries = manifest.entries.filter((entry) => entry.profileId !== profileId);
  await saveTrainingManifest({ entries: remainingEntries });

  const samples = await loadDgsSamples();
  const remainingSamples = samples.samples.filter((sample) => sample.profileId !== profileId);
  await saveDgsSamples({ samples: remainingSamples });

  const customSigns = await loadCustomSigns();
  const remainingSigns = customSigns.signs.filter((sign) => sign.profileId !== profileId);
  await saveCustomSigns({ signs: remainingSigns });

  const uploadsDir = path.join(TRAINING_UPLOADS_DIR, profileId);
  const modelsDir = path.join(MLP_MODELS_DIR, profileId);
  await fs.rm(uploadsDir, { recursive: true, force: true });
  await fs.rm(modelsDir, { recursive: true, force: true });
}

async function listFilesRecursive(dirPath: string): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...await listFilesRecursive(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

export async function buildProfileExportArchive(
  profileId: string,
  registry: ProfileRegistry,
  db: Database,
): Promise<{ buffer: Buffer; checksum: string; payload: ProfileExportPayload }> {
  const profile = registry.profiles.find((p) => p.id === profileId);
  if (!profile) {
    throw new Error('Profil nicht gefunden');
  }

  const manifest = filterManifestForProfile(await loadTrainingManifest(), profileId);
  const samples = filterSamplesForProfile(await loadDgsSamples(), profileId);
  const customSigns = await loadCustomSigns();
  const filteredCustomSigns = {
    signs: customSigns.signs.filter((sign) => sign.profileId === profileId),
  };
  const payload: ProfileExportPayload = {
    exportedAt: new Date().toISOString(),
    profile,
    dbProfile: db.profiles.find((p) => p.id === profileId) ?? null,
    usageStats: db.usageStats.filter((u) => u.profileId === profileId),
    corrections: db.corrections.filter((c) => c.profileId === profileId),
    trainingManifest: manifest,
    dgsSamples: samples,
    customSigns: filteredCustomSigns,
  };

  const zip = new AdmZip();
  zip.addFile('profile.json', Buffer.from(JSON.stringify(payload, null, 2), 'utf8'));
  zip.addFile('training_manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
  zip.addFile('dgs_samples.json', Buffer.from(JSON.stringify(samples, null, 2), 'utf8'));
  zip.addFile('custom_signs.json', Buffer.from(JSON.stringify(filteredCustomSigns, null, 2), 'utf8'));

  const uploadsDir = path.join(TRAINING_UPLOADS_DIR, profileId);
  const modelsDir = path.join(MLP_MODELS_DIR, profileId);

  if (await fs.stat(uploadsDir).then(() => true).catch(() => false)) {
    const uploadFiles = await listFilesRecursive(uploadsDir);
    for (const file of uploadFiles) {
      const relative = path.relative(uploadsDir, file);
      // Ensure forward slashes for zip compatibility across OS
      const zipPath = path.join('uploads', relative).split(path.sep).join('/');
      zip.addLocalFile(file, path.dirname(zipPath));
    }
  }

  if (await fs.stat(modelsDir).then(() => true).catch(() => false)) {
    const modelFiles = await listFilesRecursive(modelsDir);
    for (const file of modelFiles) {
      const relative = path.relative(modelsDir, file);
      // Ensure forward slashes for zip compatibility across OS
      const zipPath = path.join('models', relative).split(path.sep).join('/');
      zip.addLocalFile(file, path.dirname(zipPath));
    }
  }

  const buffer = zip.toBuffer();
  const checksum = createHash('sha256').update(buffer).digest('hex');
  return { buffer, checksum, payload };
}

export async function writeProfileBackup(
  profileId: string,
  registry: ProfileRegistry,
  db: Database,
): Promise<{ path: string; checksum: string; sizeBytes: number }> {
  const { buffer, checksum } = await buildProfileExportArchive(profileId, registry, db);
  const backupDir = path.join(PROFILE_BACKUPS_DIR, profileId);
  await ensureDir(backupDir);
  const fileName = `${Date.now()}_${checksum}.zip`;
  const fullPath = path.join(backupDir, fileName);
  await fs.writeFile(fullPath, buffer);
  return { path: fullPath, checksum, sizeBytes: buffer.length };
}

export async function listProfileBackups(profileId: string): Promise<string[]> {
  const backupDir = path.join(PROFILE_BACKUPS_DIR, profileId);
  try {
    const files = await fs.readdir(backupDir);
    return files.map((file) => path.join(backupDir, file));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function restoreProfileFromArchive(
  profileId: string,
  buffer: Buffer,
  db: Database,
): Promise<void> {
  const zip = new AdmZip(buffer);
  const profileEntry = zip.getEntry('profile.json');
  if (!profileEntry) {
    throw new Error('Backup enthält keine Profildaten');
  }
  const payload = JSON.parse(profileEntry.getData().toString('utf8')) as ProfileExportPayload;

  // Prepare data updates (do not mutate db yet)
  const newProfiles = db.profiles.filter((p) => p.id !== profileId);
  if (payload.dbProfile) {
    newProfiles.push({ ...payload.dbProfile, id: profileId });
  }

  const newUsageStats = [
    ...db.usageStats.filter((u) => u.profileId !== profileId),
    ...payload.usageStats.map((stat) => ({ ...stat, profileId })),
  ];

  const newCorrections = [
    ...db.corrections.filter((c) => c.profileId !== profileId),
    ...payload.corrections.map((corr) => ({ ...corr, profileId })),
  ];

  const existingManifest = await loadTrainingManifest();
  const manifestEntries = existingManifest.entries.filter((entry) => entry.profileId !== profileId);
  const newManifest = { entries: [...manifestEntries, ...payload.trainingManifest.entries] };

  const existingSamples = await loadDgsSamples();
  const sampleEntries = existingSamples.samples.filter((sample) => sample.profileId !== profileId);
  const newSamples = { samples: [...sampleEntries, ...payload.dgsSamples.samples] };

  const existingSigns = await loadCustomSigns();
  const restoredCustomSigns = payload.customSigns ?? { signs: [] };
  const remainingSigns = existingSigns.signs.filter((sign) => sign.profileId !== profileId);
  const newSigns = { signs: [...remainingSigns, ...restoredCustomSigns.signs] };

  const uploadsDir = path.join(TRAINING_UPLOADS_DIR, profileId);
  const modelsDir = path.join(MLP_MODELS_DIR, profileId);

  // Validate archive entries before any file system mutation
  const uploadsEntries = zip.getEntries().filter((entry) => entry.entryName.startsWith('uploads/'));
  for (const entry of uploadsEntries) {
    const relative = entry.entryName.replace(/^uploads\//, '');
    if (relative.includes('..') || path.isAbsolute(relative)) {
      throw new Error(`Invalid path in archive: ${entry.entryName}`);
    }
    const dest = path.join(uploadsDir, relative);
    if (!dest.startsWith(uploadsDir + path.sep) && dest !== uploadsDir) {
      throw new Error(`Path escape detected: ${entry.entryName}`);
    }
  }

  const modelsEntries = zip.getEntries().filter((entry) => entry.entryName.startsWith('models/'));
  for (const entry of modelsEntries) {
    const relative = entry.entryName.replace(/^models\//, '');
    if (relative.includes('..') || path.isAbsolute(relative)) {
      throw new Error(`Invalid path in archive: ${entry.entryName}`);
    }
    const dest = path.join(modelsDir, relative);
    if (!dest.startsWith(modelsDir + path.sep) && dest !== modelsDir) {
      throw new Error(`Path escape detected: ${entry.entryName}`);
    }
  }

  // File system operations
  await fs.rm(uploadsDir, { recursive: true, force: true });
  await fs.rm(modelsDir, { recursive: true, force: true });

  for (const entry of uploadsEntries) {
    const relative = entry.entryName.replace(/^uploads\//, '');
    const dest = path.join(uploadsDir, relative);
    await ensureDir(path.dirname(dest));
    await fs.writeFile(dest, entry.getData());
  }

  for (const entry of modelsEntries) {
    const relative = entry.entryName.replace(/^models\//, '');
    const dest = path.join(modelsDir, relative);
    await ensureDir(path.dirname(dest));
    await fs.writeFile(dest, entry.getData());
  }

  // Persist manifest updates
  await saveTrainingManifest(newManifest);
  await saveDgsSamples(newSamples);
  await saveCustomSigns(newSigns);

  // Final step: update in-memory database
  db.profiles = newProfiles;
  db.usageStats = newUsageStats;
  db.corrections = newCorrections;
}
