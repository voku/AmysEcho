#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
  const args = { outDir: 'tmp/reference-sources', dryRun: false, failFast: false, retries: 2 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (arg === '--out-dir') {
      const next = argv[i + 1];
      if (!next) {
        throw new Error('--out-dir requires a value');
      }
      args.outDir = next;
      i += 1;
      continue;
    }
    if (arg === '--fail-fast') {
      args.failFast = true;
      continue;
    }
    if (arg === '--retries') {
      const next = argv[i + 1];
      if (!next) {
        throw new Error('--retries requires a numeric value');
      }
      const parsed = Number.parseInt(next, 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error('--retries must be a non-negative integer');
      }
      args.retries = parsed;
      i += 1;
    }
  }
  return args;
}

function buildRawUrl(repoUrl, commit, filePath) {
  const [owner, repo] = repoUrl.replace('https://github.com/', '').split('/');
  return `https://raw.githubusercontent.com/${owner}/${repo}/${commit}/${filePath}`;
}

async function main() {
  const { outDir, dryRun, failFast, retries } = parseArgs(process.argv.slice(2));
  const mappingPath = path.join('docs', 'research', 'reference-repos', 'sources.json');
  const mappingContent = await readFile(mappingPath, 'utf8');
  const mapping = JSON.parse(mappingContent);

  if (!mapping || !Array.isArray(mapping.repos)) {
    throw new Error('Invalid sources.json format: expected { repos: [...] }');
  }

  const failures = [];
  let downloadedCount = 0;
  let skippedCount = 0;

  for (const repo of mapping.repos) {
    const repoName = String(repo.name ?? '').replace(/[\\/]/g, '__');
    if (!repoName || !repo.url || !repo.commit || !Array.isArray(repo.files)) {
      throw new Error(`Invalid repo entry in sources.json: ${JSON.stringify(repo)}`);
    }

    for (const filePath of repo.files) {
      const relativeFile = String(filePath);
      const targetPath = path.join(outDir, repoName, relativeFile);

      // Guard against path traversal: both repoName and filePath must resolve
      // to a descendant of outDir. Entries containing '..' or absolute paths
      // in sources.json could otherwise overwrite arbitrary checkout files.
      // Use path.relative() so the check is cross-platform (no path.sep fragility).
      const resolvedOutDir = path.resolve(outDir);
      const rel = path.relative(resolvedOutDir, path.resolve(targetPath));
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`Path traversal detected in sources.json entry: ${JSON.stringify({ repo: repo.name, file: filePath })}`);
      }

      const rawUrl = buildRawUrl(repo.url, repo.commit, relativeFile);

      if (dryRun) {
        console.log(`[dry-run] ${rawUrl} -> ${targetPath}`);
        skippedCount += 1;
        continue;
      }

      let lastError = null;
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          const response = await fetch(rawUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const body = await response.text();
          await mkdir(path.dirname(targetPath), { recursive: true });
          await writeFile(targetPath, body, 'utf8');
          downloadedCount += 1;
          console.log(`Downloaded ${rawUrl} -> ${targetPath}`);
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < retries) {
            console.warn(`Retrying (${attempt + 1}/${retries}) ${rawUrl}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
      if (!lastError) {
        continue;
      }

      const message = lastError instanceof Error ? lastError.message : String(lastError);
      failures.push({ rawUrl, targetPath, message });
      console.error(`Failed ${rawUrl}: ${message}`);
      if (failFast) {
        throw new Error(`Stopping due to --fail-fast after download failure: ${rawUrl}`);
      }
    }
  }

  if (dryRun) {
    console.log(`Dry-run complete (${skippedCount} planned downloads).`);
    return;
  }

  console.log(`Download complete: ${downloadedCount} succeeded, ${failures.length} failed.`);
  if (failures.length > 0) {
    failures.forEach((failure) => {
      console.error(`- ${failure.rawUrl} -> ${failure.targetPath} (${failure.message})`);
    });
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
