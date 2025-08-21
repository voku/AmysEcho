#!/usr/bin/env node
// Simple hybrid-vs-local evaluation utility.
// Input JSON: Array of {
//   id: string,
//   truth: string,
//   local: { probabilities: number[], labels: string[] }, // local model output
//   remote?: { label: string, confidence: number }        // optional remote output
// }
// Usage: node scripts/eval-hybrid.js path/to/dataset.json --threshold=0.6

const fs = require('fs');

function arg(name, def) {
  const tag = `--${name}=`;
  const a = process.argv.find((x) => x.startsWith(tag));
  if (!a) return def;
  const v = a.slice(tag.length);
  if (v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/eval-hybrid.js path/to/dataset.json [--threshold=0.6]');
    process.exit(1);
  }
  const threshold = Number(arg('threshold', 0.6));
  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw);

  let localCorrect = 0;
  let hybridCorrect = 0;
  let total = 0;
  let improved = 0;

  for (const s of data) {
    total++;
    const { probabilities, labels } = s.local;
    const maxIdx = probabilities.reduce((mi, v, i) => (v > probabilities[mi] ? i : mi), 0);
    const localPred = labels[maxIdx] || 'unknown';
    const localConf = probabilities[maxIdx] || 0;

    const hybrid = (() => {
      if (s.remote && s.remote.confidence >= threshold) {
        return { label: s.remote.label, confidence: s.remote.confidence, path: 'remote' };
      }
      return { label: localPred, confidence: localConf, path: 'local' };
    })();

    if (localPred === s.truth) localCorrect++;
    if (hybrid.label === s.truth) hybridCorrect++;
    if (hybrid.label === s.truth && localPred !== s.truth) improved++;
  }

  const pct = (n) => (total ? ((n / total) * 100).toFixed(1) : '0.0');
  console.log('Samples:', total);
  console.log('Local accuracy:', `${pct(localCorrect)}%`);
  console.log('Hybrid accuracy:', `${pct(hybridCorrect)}%`);
  console.log('Improved cases:', improved, `(${pct(improved)}%)`);
}

main().catch((e) => {
  console.error('Eval failed:', e);
  process.exit(1);
});

