#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');

function chunk(str, size) {
  const out = [];
  for (let i = 0; i < str.length; i += size) out.push(str.slice(i, i + size));
  return out;
}

function writeTs(outPath, varName, base64, header) {
  const chunks = chunk(base64, 76);
  const body = chunks.join("' +\n  '");
  const content = `${header}\nexport const ${varName} =\n  '${body}';\n`;
  fs.writeFileSync(outPath, content);
}

function fetchHttps(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Request failed: ${res.statusCode}`));
          res.resume();
          return;
        }
        const data = [];
        res.on('data', (c) => data.push(c));
        res.on('end', () => resolve(Buffer.concat(data)));
      })
      .on('error', reject);
  });
}

async function fetch(url) {
  try {
    return await fetchHttps(url);
  } catch (err) {
    const curl = spawnSync('curl', ['-L', url], { encoding: null });
    if (curl.status === 0) return Buffer.from(curl.stdout);
    throw err;
  }
}

async function updateFflate() {
  const appDir = path.join(__dirname, '..', 'app');
  const dest = path.join(appDir, 'src', 'webview', 'fflateBase64.ts');
  let version = '0.8.2';
  try {
    const existing = fs.readFileSync(dest, 'utf8');
    const m = existing.match(/fflate@([\d.]+)\/umd/);
    if (m) version = m[1];
  } catch {}
  const url = `https://cdn.jsdelivr.net/npm/fflate@${version}/umd/index.js`;
  try {
    const buf = await fetch(url);
    const base64 = buf.toString('base64');
    const header = `/**\n * Generated from fflate@${version}/umd/index.js\n * Run scripts/update-webview-base64.js after updating fflate.\n */`;
    writeTs(dest, 'fflateBase64', base64, header);
  } catch (e) {
    console.warn('fflate download failed:', e.message || e.code || e);
  }
}

function updateInstallMlp() {
  const appDir = path.join(__dirname, '..', 'app');
  const tsNodePath = require.resolve('ts-node', { paths: [appDir] });
  const tsNode = require(tsNodePath);
  tsNode.register({
    transpileOnly: true,
    compilerOptions: { module: 'commonjs', target: 'es2018', lib: ['es2020', 'dom'] },
  });
  const { installMlp } = require(path.join(appDir, 'src', 'webview', 'installMlp.ts'));
  const code = `(${installMlp.toString()})();`;
  const base64 = Buffer.from(code, 'utf8').toString('base64');
  const header = `/**\n * Generated from app/src/webview/installMlp.ts\n * Run scripts/update-webview-base64.js after modifying installMlp.ts.\n */`;
  const dest = path.join(appDir, 'src', 'webview', 'installMlpBase64.ts');
  writeTs(dest, 'installMlpBase64', base64, header);
}

async function main() {
  await updateFflate();
  updateInstallMlp();
  console.log('Updated Base64 webview dependencies.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
