import { promises as fs } from 'fs';
import path from 'path';

export interface CrashReport {
  id: string;
  name: string;
  message: string;
  stack?: string;
  timestamp: number;
  extra?: Record<string, unknown>;
}

const CRASH_PATH = path.join(process.cwd(), 'crash_reports.json');

export async function loadCrashReports(): Promise<CrashReport[]> {
  try {
    const data = await fs.readFile(CRASH_PATH, 'utf8');
    return JSON.parse(data) as CrashReport[];
  } catch {
    return [];
  }
}

export async function saveCrashReports(reports: CrashReport[]): Promise<void> {
  await fs.writeFile(CRASH_PATH, JSON.stringify(reports, null, 2), 'utf8');
}

export async function appendCrashReports(newReports: CrashReport[]): Promise<number> {
  const existing = await loadCrashReports();
  const merged = existing.concat(newReports);
  // Keep last 1000 to prevent unbounded growth
  const pruned = merged.slice(-1000);
  await saveCrashReports(pruned);
  return newReports.length;
}

