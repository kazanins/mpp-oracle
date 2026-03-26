/**
 * Audio player — plays base64 WAV audio and drives viseme animation.
 */

let audioContext = null;

function getAudioContext() {
  if (!audioContext) audioContext = new AudioContext({ sampleRate: 24000 });
  return audioContext;
}

// Pre-unlock AudioContext on first user interaction so speech plays instantly
function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  document.removeEventListener('click', unlockAudio);
  document.removeEventListener('touchstart', unlockAudio);
  document.removeEventListener('keydown', unlockAudio);
}
document.addEventListener('click', unlockAudio);
document.addEventListener('touchstart', unlockAudio);
document.addEventListener('keydown', unlockAudio);

// Viseme → blend shape mapping
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

const ALL_MOUTH_MORPHS = ['jawOpen', 'mouthClose', 'mouthFunnel', 'mouthPucker',
  'mouthStretch_L', 'mouthStretch_R', 'mouthSmile_L', 'mouthSmile_R',
  'mouthLowerDown_L', 'mouthLowerDown_R', 'mouthUpperUp_L', 'mouthUpperUp_R',
  'mouthShrugUpper', 'mouthShrugLower', 'tongueOut'];

/**
 * Play base64 WAV audio with viseme-driven lip sync.
 * @param {string} base64Audio - Base64-encoded WAV
 * @param {Array} timeline - [{startTime, viseme}]
 * @param {function} setMorph - (name, value) => void
 * @returns {Promise} resolves when audio finishes
 */
export async function playWithLipSync(base64Audio, timeline, setMorph) {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    // AudioContext blocked by browser autoplay policy — wait for user gesture
    await new Promise((resolve) => {
      const resume = async () => {
        await ctx.resume();
        document.removeEventListener('click', resume);
        document.removeEventListener('touchstart', resume);
        document.removeEventListener('keydown', resume);
        resolve();
      };
      document.addEventListener('click', resume, { once: true });
      document.addEventListener('touchstart', resume, { once: true });
      document.addEventListener('keydown', resume, { once: true });
    });
  }

  // Decode base64 WAV
  const binaryString = atob(base64Audio);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  const audioBuffer = await ctx.decodeAudioData(bytes.buffer);

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);

  const startTime = ctx.currentTime;

  return new Promise((resolve) => {
    source.onended = () => {
      // Reset mouth
      for (const name of ALL_MOUTH_MORPHS) setMorph(name, 0);
      resolve();
    };
    source.start();

    const poll = () => {
      const elapsed = ctx.currentTime - startTime;

      // Find current amplitude from timeline
      let amplitude = 0;
      for (let i = timeline.length - 1; i >= 0; i--) {
        if (elapsed >= timeline[i].startTime) {
          amplitude = timeline[i].amplitude || 0;
          break;
        }
      }

      // Drive mouth from amplitude
      const t = Date.now() * 0.01;
      setMorph('jawOpen', amplitude * 0.7);
      setMorph('mouthFunnel', amplitude * 0.3 * Math.max(0, Math.sin(t * 1.1)));
      setMorph('mouthStretch_L', amplitude * 0.15 * Math.max(0, Math.sin(t * 1.3)));
      setMorph('mouthStretch_R', amplitude * 0.15 * Math.max(0, Math.sin(t * 1.3)));
      setMorph('mouthLowerDown_L', amplitude * 0.2 * Math.max(0, Math.cos(t * 1.2)));
      setMorph('mouthLowerDown_R', amplitude * 0.2 * Math.max(0, Math.cos(t * 1.2)));

      if (elapsed < audioBuffer.duration) {
        requestAnimationFrame(poll);
      }
    };
    poll();
  });
}
