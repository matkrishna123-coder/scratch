/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

/**
 * Helpers
 */
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  console.log('Copied', path.relative(process.cwd(), dest));
}

function listFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const ent of fs.readdirSync(cur, { withFileTypes: true })) {
      const p = path.join(cur, ent.name);
      if (ent.isDirectory()) stack.push(p);
      else out.push(p);
    }
  }
  return out;
}

/**
 * Walk up from the project root to find node_modules/@mediapipe/tasks-vision
 * (Avoids require.resolve('.../package.json') which may not be exported.)
 */
function findTasksVisionRoot(projectRoot) {
  const parts = projectRoot.split(path.sep);
  for (let i = parts.length; i > 0; i--) {
    const candidate = path.join(
      parts.slice(0, i).join(path.sep),
      'node_modules',
      '@mediapipe',
      'tasks-vision'
    );
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

(function main() {
  const projectRoot = path.resolve(__dirname, '..'); // scratch-gui root
  const pkgRoot = findTasksVisionRoot(projectRoot);
  if (!pkgRoot) {
    throw new Error('Could not locate @mediapipe/tasks-vision under any parent node_modules folder.');
  }

  console.log('Found @mediapipe/tasks-vision at:', pkgRoot);

  const destRoot = path.join(projectRoot, 'static', 'mediapipe', 'vision');
  ensureDir(destRoot);

  /**
   * 1) Copy the ESM bundle (vision_bundle.mjs)
   *    Your version keeps it at package root; we also check dist/ for future-proofing.
   */
  const bundleCandidates = [
    path.join(pkgRoot, 'vision_bundle.mjs'),
    path.join(pkgRoot, 'dist', 'vision_bundle.mjs')
  ];
  const srcBundle = bundleCandidates.find(p => fs.existsSync(p));
  if (!srcBundle) {
    throw new Error('vision_bundle.mjs not found (checked package root and dist/).');
  }
  copyFile(srcBundle, path.join(destRoot, 'vision_bundle.mjs'));

  /**
   * 2) Copy wasm runtime files
   *    Your package has /wasm at the root (not dist/wasm). We support both.
   */
  const wasmSrcDir = fs.existsSync(path.join(pkgRoot, 'wasm'))
    ? path.join(pkgRoot, 'wasm')
    : path.join(pkgRoot, 'dist', 'wasm');

  if (!fs.existsSync(wasmSrcDir)) {
    console.warn('Warning: wasm directory not found at', wasmSrcDir);
  } else {
    const wasmDestDir = path.join(destRoot, 'wasm');
    ensureDir(wasmDestDir);

    // Copy known runtime files (current naming) if present
    const knownFiles = [
      'vision_wasm_internal.js',
      'vision_wasm_internal.wasm',          // SIMD build
      'vision_wasm_nosimd_internal.js',
      'vision_wasm_nosimd_internal.wasm'    // non-SIMD build
    ];

    let copiedAny = false;
    for (const name of knownFiles) {
      const src = path.join(wasmSrcDir, name);
      if (fs.existsSync(src)) {
        copyFile(src, path.join(wasmDestDir, name));
        copiedAny = true;
      }
    }

    // Also copy any other wasm/js files that match vision_wasm* (future-proof)
    const all = listFiles(wasmSrcDir).filter(f =>
      /vision_wasm.*\.(wasm|js)$/i.test(path.basename(f))
    );
    for (const src of all) {
      const dest = path.join(wasmDestDir, path.basename(src));
      if (!fs.existsSync(dest)) {
        copyFile(src, dest);
        copiedAny = true;
      }
    }

    if (!copiedAny) {
      console.warn('No wasm runtime files were copied from', wasmSrcDir);
    }

    // 3) Compatibility aliases (avoid 404s from older naming schemes)
    const aliasPairs = [
      // Some code expects these dotted names:
      ['vision_wasm_internal.wasm',        'vision_wasm_internal.simd.wasm'],
      ['vision_wasm_nosimd_internal.wasm', 'vision_wasm_internal.nosimd.wasm']
    ];
    for (const [fromName, toName] of aliasPairs) {
      const from = path.join(wasmDestDir, fromName);
      const to   = path.join(wasmDestDir, toName);
      if (fs.existsSync(from) && !fs.existsSync(to)) {
        fs.copyFileSync(from, to);
        console.log('Aliased', toName, '->', fromName);
      }
    }
  }

  console.log('MediaPipe assets copied successfully.');
})();
