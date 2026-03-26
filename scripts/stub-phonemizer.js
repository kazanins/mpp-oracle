/**
 * postinstall script — replaces the real phonemizer package (espeak-ng WASM)
 * with a tiny stub so kokoro-js can import it without crashing on Railway.
 */
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const phonemizerDir = join(__dirname, '..', 'node_modules', 'phonemizer');

if (!existsSync(join(__dirname, '..', 'node_modules'))) {
  // node_modules doesn't exist yet (first install pass), skip
  process.exit(0);
}

// Wipe real phonemizer
if (existsSync(phonemizerDir)) {
  rmSync(phonemizerDir, { recursive: true, force: true });
}
mkdirSync(phonemizerDir, { recursive: true });

// Write stub package.json
writeFileSync(join(phonemizerDir, 'package.json'), JSON.stringify({
  name: 'phonemizer',
  version: '1.2.1',
  type: 'module',
  main: 'index.js',
}, null, 2));

// Write stub module
writeFileSync(join(phonemizerDir, 'index.js'),
  `// Stub — real phonemizer crashes on Railway (espeak-ng WASM)\n` +
  `export default function phonemize() { return ''; }\n` +
  `export { phonemize };\n`
);

console.log('[postinstall] Replaced phonemizer with stub (avoids espeak-ng WASM crash)');
