#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const docPath = path.join(repoRoot, 'docs', 'VisionBundleSource.md');
const checksumPath = path.join(repoRoot, 'app', 'webview', 'vision_bundle.sha256');
const bundlePath = path.join(repoRoot, 'app', 'webview', 'vision_bundle.js');

const args = process.argv.slice(2);
const sourceArg = args.find(arg => arg.startsWith('--source='));
const dateArg = args.find(arg => arg.startsWith('--date='));

function formatDate(inputDate) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
  return formatter.format(inputDate);
}

function parseDateArgument(value) {
  if (!value) {
    return null;
  }
  const isoMatch = value.match(/^\d{4}-\d{2}-\d{2}$/);
  if (!isoMatch) {
    throw new Error(`Invalid --date format. Use YYYY-MM-DD, received: ${value}`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unable to parse provided date: ${value}`);
  }
  return parsed;
}

async function main() {
  const checksum = (await fs.promises.readFile(checksumPath, 'utf8')).trim();
  const doc = await fs.promises.readFile(docPath, 'utf8');
  const stat = await fs.promises.stat(bundlePath);

  const explicitDate = dateArg ? parseDateArgument(dateArg.split('=')[1]) : null;
  const dateToUse = explicitDate ?? new Date(stat.mtimeMs);
  const formattedDate = formatDate(dateToUse);

  let updatedDoc = doc;
  const dateRegex = /(- \*\*Last synchronized:\*\* ).*/;
  if (!dateRegex.test(updatedDoc)) {
    throw new Error('Could not find the "Last synchronized" line to update.');
  }
  updatedDoc = updatedDoc.replace(dateRegex, `$1${formattedDate}`);

  const checksumRegex = /(- \*\*SHA-256:\*\* ).*/;
  if (!checksumRegex.test(updatedDoc)) {
    throw new Error('Could not find the "SHA-256" line to update.');
  }
  updatedDoc = updatedDoc.replace(checksumRegex, `$1\`${checksum}\``);

  if (sourceArg) {
    const sourceValue = sourceArg.split('=')[1];
    if (!sourceValue) {
      throw new Error('The --source option requires a non-empty value.');
    }
    const sourceRegex = /(- \*\*Source:\*\* ).*/;
    if (!sourceRegex.test(updatedDoc)) {
      throw new Error('Could not find the "Source" line to update.');
    }
    updatedDoc = updatedDoc.replace(sourceRegex, `$1\`${sourceValue}\``);
  }

  await fs.promises.writeFile(docPath, updatedDoc);
  console.log(`Updated ${path.relative(repoRoot, docPath)} with date ${formattedDate} and checksum ${checksum}`);
  if (sourceArg) {
    console.log(`Source set to ${sourceArg.split('=')[1]}`);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
