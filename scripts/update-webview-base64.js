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
  const chunks = chunk(base64, 8192);
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
  let ts;
  try {
    const tsPath = require.resolve('typescript', { paths: [appDir, __dirname] });
    ts = require(tsPath);
  } catch (e) {
    throw new Error('TypeScript not found. Run "npm ci --prefix app" before this script.');
  }
  const srcPath = path.join(appDir, 'src', 'webview', 'installMlp.ts');
  const tsCode = fs.readFileSync(srcPath, 'utf8');
  const { outputText } = ts.transpileModule(tsCode, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018, lib: ['es2020', 'dom'] },
  });
  const Module = module.constructor;
  const m = new Module();
  m.paths = Module._nodeModulePaths(appDir);
  m._compile(outputText, srcPath);
  const install = m.exports.installMlp || m.exports.default;
  if (typeof install !== 'function') {
    throw new Error('installMlp export not found in installMlp.ts');
  }
  const code = `(${install.toString()})();`;
  const base64 = Buffer.from(code, 'utf8').toString('base64');
  const header = `/**\n * Generated from app/src/webview/installMlp.ts\n * Run scripts/update-webview-base64.js after modifying installMlp.ts.\n */`;
  const dest = path.join(appDir, 'src', 'webview', 'installMlpBase64.ts');
  writeTs(dest, 'installMlpBase64', base64, header);
}

async function updateGestureDetector() {
  const appDir = path.join(__dirname, '..', 'app');
  const esbuildPath = path.join(appDir, 'node_modules', '.bin', 'esbuild');
  const inputFile = path.join(appDir, 'webview', 'gestureDetector.ts');
  const outputFile = path.join(appDir, 'assets', 'gestureDetector.js');

  // Bundle the file
  spawnSync(esbuildPath, [inputFile, '--bundle', `--outfile=${outputFile}`, '--format=iife'], { stdio: 'inherit' });

  // Read the bundled file
  const bundledCode = fs.readFileSync(outputFile, 'utf8');

  // Add header comment to the bundled file
  const header = `/**\n * Generated from app/webview/gestureDetector.ts\n * Run scripts/update-webview-base64.js after modifying gestureDetector.ts.\n */\n`;
  const bundledCodeWithHeader = header + bundledCode;
  fs.writeFileSync(outputFile, bundledCodeWithHeader);

  const base64 = Buffer.from(bundledCodeWithHeader, 'utf8').toString('base64');
  const base64Header = `/**\n * Generated from app/webview/gestureDetector.ts\n * Run scripts/update-webview-base64.js after modifying gestureDetector.ts.\n */`;
  const dest = path.join(appDir, 'src', 'webview', 'gestureDetectorBase64.ts');
  writeTs(dest, 'gestureDetectorBase64', base64, base64Header);
}

async function main() {
  await updateFflate();
  updateInstallMlp();
  await updateGestureDetector();
  console.log('Updated Base64 webview dependencies.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
