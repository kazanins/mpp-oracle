// Stub for phonemizer — the real package bundles espeak-ng WASM which crashes on Railway.
// kokoro-js depends on phonemizer but we don't need phoneme output, only audio.
export default function phonemize() {
  return '';
}
export { phonemize };
