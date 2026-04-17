#!/usr/bin/env node
/**
 * Copy tesseract.js runtime assets from node_modules into public/tesseract/
 * and download the English language data on first run.
 *
 * Why: tesseract.js by default fetches its core WASM from a CDN (jsDelivr)
 * and language data from tessdata.projectnaptha.com. Both were observed to
 * hang on mobile networks (step 3 stuck at 0%). Self-hosting makes the
 * assets load from the same origin as the app, eliminating the CDN hop.
 *
 * Runs on `postinstall` so Vercel picks it up automatically, and on first
 * local install. Idempotent: skips the language-data download when the file
 * already exists.
 */
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public', 'tesseract');
const coreDir = path.join(projectRoot, 'node_modules', 'tesseract.js-core');
const workerSrc = path.join(
  projectRoot,
  'node_modules',
  'tesseract.js',
  'dist',
  'worker.min.js',
);

// We ship both the plain and SIMD LSTM variants. Tesseract.js picks the
// right one at runtime based on WebAssembly SIMD support in the browser.
// Non-LSTM variants and asm.js fallbacks are skipped to keep deploys small.
const coreFiles = [
  'tesseract-core-lstm.js',
  'tesseract-core-lstm.wasm',
  'tesseract-core-simd-lstm.js',
  'tesseract-core-simd-lstm.wasm',
];

const LANG_URL =
  'https://tessdata.projectnaptha.com/4.0.0_fast/eng.traineddata.gz';

async function main() {
  // If tesseract.js isn't installed yet (e.g. postinstall on a clean clone
  // where install is still resolving), bail gracefully instead of failing.
  try {
    await stat(coreDir);
    await stat(workerSrc);
  } catch {
    console.log('[tesseract-assets] tesseract.js not installed yet, skipping');
    return;
  }

  await mkdir(publicDir, { recursive: true });

  await copyFile(workerSrc, path.join(publicDir, 'worker.min.js'));
  for (const f of coreFiles) {
    await copyFile(path.join(coreDir, f), path.join(publicDir, f));
  }
  console.log(`[tesseract-assets] copied ${coreFiles.length + 1} core files`);

  const langFile = path.join(publicDir, 'eng.traineddata.gz');
  try {
    const s = await stat(langFile);
    if (s.size > 1_000_000) {
      console.log('[tesseract-assets] eng.traineddata.gz already present');
      return;
    }
  } catch {
    // not present, fall through to download
  }

  console.log(`[tesseract-assets] downloading ${LANG_URL}`);
  await download(LANG_URL, langFile);
  const final = await stat(langFile);
  console.log(`[tesseract-assets] downloaded eng.traineddata.gz (${Math.round(final.size / 1024)}KB)`);
}

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'));
    const req = https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return download(res.headers.location, dest, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
      }
      const file = createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', reject);
    });
    req.on('error', reject);
  });
}

main().catch((err) => {
  // Don't fail the whole install if the CDN is down — log and continue.
  // The app can still run against the default public tessdata CDN as a
  // last-resort fallback (the asset copy from node_modules still succeeds).
  console.warn('[tesseract-assets] WARNING:', err?.message ?? err);
  console.warn('[tesseract-assets] You can retry later with: npm run prepare-tesseract');
});
