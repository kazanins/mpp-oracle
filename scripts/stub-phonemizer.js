/**
 * postinstall script — replaces the real phonemizer package (espeak-ng WASM)
 * with a tiny stub so kokoro-js can import it without crashing on Railway.
 *
 * kokoro-js calls: (await phonemize(text, lang)).join(" ")
 * So phonemize must return an array of strings.
 */
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const phonemizerDir = join(__dirname, '..', 'node_modules', 'phonemizer');

if (!existsSync(join(__dirname, '..', 'node_modules'))) {
  process.exit(0);
}

if (existsSync(phonemizerDir)) {
  rmSync(phonemizerDir, { recursive: true, force: true });
}
mkdirSync(phonemizerDir, { recursive: true });

writeFileSync(join(phonemizerDir, 'package.json'), JSON.stringify({
  name: 'phonemizer',
  version: '1.2.1',
  type: 'module',
  main: 'index.js',
}, null, 2));

// phonemize(text, lang) must return an array — kokoro-js calls .join(" ") on the result
writeFileSync(join(phonemizerDir, 'index.js'),
  `// Stub — real phonemizer crashes on Railway (espeak-ng WASM)\n` +
  `// Returns input text split into chars as fallback phonemes\n` +
  `export async function phonemize(text, lang) { return [text]; }\n` +
  `export default phonemize;\n`
);

console.log('[postinstall] Replaced phonemizer with stub (avoids espeak-ng WASM crash)');
