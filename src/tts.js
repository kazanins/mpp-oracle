import { KokoroTTS, TextSplitterStream } from 'kokoro-js';

let tts = null;
let audioContext = null;
let isSpeaking = false;

// IPA phoneme → Oculus viseme mapping
// Based on standard IPA-to-viseme tables
const ipaToViseme = {
  // Silence
  ' ': 'sil', '.': 'sil', ',': 'sil', '?': 'sil', '!': 'sil',
  'ˈ': null, 'ˌ': null, 'ː': null, // stress/length markers — skip

  // PP (p, b, m) — lips together
  'p': 'PP', 'b': 'PP', 'm': 'PP',

  // FF (f, v) — lower lip to upper teeth
  'f': 'FF', 'v': 'FF',

  // TH (θ, ð) — tongue between teeth
  'θ': 'TH', 'ð': 'TH',

  // DD (t, d) — tongue behind upper teeth
  't': 'DD', 'd': 'DD',

  // kk (k, g, ŋ) — back of tongue to soft palate
  'k': 'kk', 'g': 'kk', 'ŋ': 'kk',

  // CH (tʃ, dʒ, ʃ, ʒ) — tongue to roof
  'ʃ': 'CH', 'ʒ': 'CH', 'tʃ': 'CH', 'dʒ': 'CH',

  // SS (s, z) — tongue behind teeth, narrow
  's': 'SS', 'z': 'SS',

  // nn (n, l) — tongue tip up
  'n': 'NN', 'l': 'NN',

  // RR (r) — tongue curled
  'ɹ': 'RR', 'r': 'RR', 'ɻ': 'RR',

  // aa (open mouth)
  'æ': 'aa', 'ɑ': 'aa', 'a': 'aa', 'ɐ': 'aa',

  // E (as in "bet")
  'ɛ': 'E', 'e': 'E', 'ə': 'E', 'ɜ': 'E',

  // I (as in "bit")
  'ɪ': 'I', 'i': 'I', 'ɨ': 'I',

  // O (as in "bought")
  'ɔ': 'O', 'o': 'O', 'ɒ': 'O',

  // U (as in "boot")
  'ʊ': 'U', 'u': 'U', 'ʌ': 'U', 'ɵ': 'U',

  // Diphthongs — map to the starting vowel
  'aɪ': 'aa', 'aʊ': 'aa', 'eɪ': 'E', 'oʊ': 'O', 'ɔɪ': 'O',

  // Other consonants
  'h': 'sil', 'ɦ': 'sil',
  'w': 'U', 'j': 'I',
  'ʔ': 'sil',
};

// Viseme → facecap blend shape mapping (using _L/_R naming)
const visemeToMorphs = {
  'sil': { jawOpen: 0 },
  'PP':  { jawOpen: 0.02, mouthClose: 0.6, mouthPucker: 0.3 },
  'FF':  { jawOpen: 0.1, mouthFunnel: 0.4, mouthLowerDown_L: 0.2, mouthLowerDown_R: 0.2 },
  'TH':  { jawOpen: 0.15, tongueOut: 0.3, mouthLowerDown_L: 0.1, mouthLowerDown_R: 0.1 },
  'DD':  { jawOpen: 0.15, mouthStretch_L: 0.2, mouthStretch_R: 0.2 },
  'kk':  { jawOpen: 0.25, mouthStretch_L: 0.1, mouthStretch_R: 0.1 },
  'CH':  { jawOpen: 0.15, mouthFunnel: 0.5, mouthShrugUpper: 0.3 },
  'SS':  { jawOpen: 0.1, mouthStretch_L: 0.3, mouthStretch_R: 0.3, mouthClose: 0.2 },
  'NN':  { jawOpen: 0.1, mouthStretch_L: 0.15, mouthStretch_R: 0.15 },
  'RR':  { jawOpen: 0.2, mouthFunnel: 0.3, mouthPucker: 0.2 },
  'aa':  { jawOpen: 0.55, mouthLowerDown_L: 0.3, mouthLowerDown_R: 0.3, mouthStretch_L: 0.2, mouthStretch_R: 0.2 },
  'E':   { jawOpen: 0.3, mouthStretch_L: 0.35, mouthStretch_R: 0.35 },
  'I':   { jawOpen: 0.15, mouthSmile_L: 0.3, mouthSmile_R: 0.3, mouthStretch_L: 0.2, mouthStretch_R: 0.2 },
  'O':   { jawOpen: 0.4, mouthFunnel: 0.5, mouthPucker: 0.2 },
  'U':   { jawOpen: 0.15, mouthPucker: 0.5, mouthFunnel: 0.4 },
};

// All mouth-related morph names we use
const allMouthMorphs = new Set();
for (const morphs of Object.values(visemeToMorphs)) {
  for (const name of Object.keys(morphs)) allMouthMorphs.add(name);
}

/**
 * Parse IPA string into individual phonemes.
 * Handles digraphs (tʃ, dʒ, aɪ, etc.) by checking two-char combos first.
 */
function parsePhonemes(ipa) {
  const phonemes = [];
  let i = 0;
  while (i < ipa.length) {
    // Try two-char match first
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

export async function initTTS(onProgress) {
  onProgress?.('Loading TTS model...');

  tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
    dtype: 'fp32',
    device: 'webgpu',
    progress_callback: (progress) => {
      if (progress.status === 'downloading') {
        const pct = Math.round((progress.loaded / progress.total) * 100);
        onProgress?.(`Downloading voice model... ${pct}%`);
      }
    },
  });

  audioContext = new AudioContext({ sampleRate: 24000 });

  onProgress?.('Voice ready');
  return tts;
}

/**
 * Speak text with phoneme-based lip sync.
 * Uses streaming with TextSplitterStream fix for Kokoro's close() bug.
 * Plays each sentence chunk as soon as it's generated — no waiting for full synthesis.
 */
export async function speak(text, { voice = 'am_michael', speed = 1.0, onViseme, onDone } = {}) {
  if (!tts) throw new Error('TTS not initialized');
  if (isSpeaking) stopSpeaking();
  isSpeaking = true;

  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  // Fix Kokoro's stream bug: create TextSplitterStream ourselves and close() it
  const splitter = new TextSplitterStream();
  splitter.push(text);
  splitter.close();

  const stream = tts.stream(splitter, { voice, speed });

  try {
    for await (const { text: chunkText, phonemes: ipaString, audio } of stream) {
      if (!isSpeaking) break;

      console.log('[TTS] Chunk:', chunkText.slice(0, 40), 'Phonemes:', ipaString.slice(0, 40));

      const samples = audio.audio;
      const duration = samples.length / 24000;

      // Build viseme timeline for this chunk
      const phonemes = parsePhonemes(ipaString);
      const phonemeDuration = phonemes.length > 0 ? duration / phonemes.length : 0;
      const timeline = phonemes.map((p, i) => ({
        startTime: i * phonemeDuration,
        viseme: ipaToViseme[p] || 'sil',
      }));

      // Play chunk immediately
      const buffer = audioContext.createBuffer(1, samples.length, 24000);
      buffer.getChannelData(0).set(samples);
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);

      const startTime = audioContext.currentTime;

      await new Promise((resolve) => {
        source.onended = resolve;
        source.start();

        let lastViseme = null;

        const poll = () => {
          if (!isSpeaking) { resolve(); return; }
          const elapsed = audioContext.currentTime - startTime;

          let currentViseme = 'sil';
          for (let i = timeline.length - 1; i >= 0; i--) {
            if (elapsed >= timeline[i].startTime) {
              currentViseme = timeline[i].viseme;
              break;
            }
          }

          if (currentViseme !== lastViseme) {
            lastViseme = currentViseme;
            onViseme?.(currentViseme, visemeToMorphs[currentViseme] || {});
          }

          requestAnimationFrame(poll);
        };
        poll();
      });
    }
  } catch (e) {
    console.error('[TTS] Stream error:', e);
  }

  // Reset mouth
  onViseme?.('sil', visemeToMorphs['sil']);
  isSpeaking = false;
  onDone?.();
}

export function stopSpeaking() {
  isSpeaking = false;
}
