/**
 * Server-side TTS — generates audio + phoneme timeline using Kokoro.js.
 * Returns audio as base64 WAV + viseme timeline for lip sync.
 */
import { KokoroTTS, TextSplitterStream } from 'kokoro-js';
import { config } from './config.js';

let tts = null;

// IPA → viseme mapping (same as talking-head project)
const ipaToViseme = {
  ' ': 'sil', '.': 'sil', ',': 'sil', '?': 'sil', '!': 'sil',
  'ˈ': null, 'ˌ': null, 'ː': null,
  'p': 'PP', 'b': 'PP', 'm': 'PP',
  'f': 'FF', 'v': 'FF',
  'θ': 'TH', 'ð': 'TH',
  't': 'DD', 'd': 'DD',
  'k': 'kk', 'g': 'kk', 'ŋ': 'kk',
  'ʃ': 'CH', 'ʒ': 'CH', 'tʃ': 'CH', 'dʒ': 'CH',
  's': 'SS', 'z': 'SS',
  'n': 'NN', 'l': 'NN',
  'ɹ': 'RR', 'r': 'RR', 'ɻ': 'RR',
  'æ': 'aa', 'ɑ': 'aa', 'a': 'aa', 'ɐ': 'aa',
  'ɛ': 'E', 'e': 'E', 'ə': 'E', 'ɜ': 'E',
  'ɪ': 'I', 'i': 'I', 'ɨ': 'I',
  'ɔ': 'O', 'o': 'O', 'ɒ': 'O',
  'ʊ': 'U', 'u': 'U', 'ʌ': 'U', 'ɵ': 'U',
  'aɪ': 'aa', 'aʊ': 'aa', 'eɪ': 'E', 'oʊ': 'O', 'ɔɪ': 'O',
  'h': 'sil', 'ɦ': 'sil', 'w': 'U', 'j': 'I', 'ʔ': 'sil',
};

function parsePhonemes(ipa) {
  const phonemes = [];
  let i = 0;
  while (i < ipa.length) {
    if (i + 1 < ipa.length) {
      const pair = ipa.slice(i, i + 2);
      if (ipaToViseme[pair] !== undefined) {
        phonemes.push(pair);
        i += 2;
        continue;
      }
    }
    phonemes.push(ipa[i]);
    i++;
  }
  return phonemes.filter(p => ipaToViseme[p] !== null && ipaToViseme[p] !== undefined);
}

export async function initTTS() {
  console.log('Loading TTS model...');
  tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
    dtype: 'q8',
    device: 'cpu',
  });
  console.log('TTS model ready');
}

/**
 * Generate speech from text.
 * Returns { audio: Float32Array, sampleRate: number, timeline: [{startTime, viseme}] }
 */
export async function generateSpeech(text) {
  if (!tts) throw new Error('TTS not initialized');

  // Use Kokoro's stream to get phonemes (with TextSplitterStream close() fix)
  // and generate audio separately
  let fullPhonemes = '';
  const splitter = new TextSplitterStream();
  splitter.push(text);
  splitter.close();

  const stream = tts.stream(splitter, { voice: config.ttsVoice, speed: config.ttsSpeed });
  const audioChunks = [];
  for await (const { phonemes: ipaString, audio: chunkAudio } of stream) {
    fullPhonemes += ipaString + ' ';
    // Collect audio samples
    const samples = chunkAudio.audio;
    audioChunks.push(samples);
  }

  // Concatenate all audio chunks
  const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const samples = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of audioChunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }
  const samples = audio.audio;
  const duration = samples.length / 24000;

  // Build viseme timeline
  const phonemes = parsePhonemes(fullPhonemes);
  const phonemeDuration = phonemes.length > 0 ? duration / phonemes.length : 0;
  const timeline = phonemes.map((p, i) => ({
    startTime: i * phonemeDuration,
    viseme: ipaToViseme[p] || 'sil',
  }));

  console.log(`[TTS] Generated ${duration.toFixed(1)}s audio, ${phonemes.length} phonemes`);

  return {
    audio: samples,
    sampleRate: 24000,
    duration,
    timeline,
  };
}

/**
 * Convert Float32Array audio to WAV ArrayBuffer.
 */
export function audioToWav(samples, sampleRate = 24000) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * (bitsPerSample / 8);

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // WAV header
  const writeString = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Convert float32 to int16
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return buffer;
}
