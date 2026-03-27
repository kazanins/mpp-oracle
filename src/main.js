/**
 * MPP Oracle — public talking head that answers paid questions.
 * TTS runs client-side via Kokoro.js + WebGPU for instant speech.
 */
import { initScene, setMorph } from './scene.js';
import { connect } from './ws-client.js';
import { initTTS, speak, stopSpeaking } from './tts.js';

// All mouth-related morphs that need resetting
const ALL_MOUTH_MORPHS = ['jawOpen', 'mouthClose', 'mouthFunnel', 'mouthPucker',
  'mouthStretch_L', 'mouthStretch_R', 'mouthSmile_L', 'mouthSmile_R',
  'mouthLowerDown_L', 'mouthLowerDown_R', 'mouthUpperUp_L', 'mouthUpperUp_R',
  'mouthShrugUpper', 'mouthShrugLower', 'tongueOut'];

// DOM elements
const questionEl = document.getElementById('current-question');
const askerEl = document.getElementById('asker-name');
const answerEl = document.getElementById('answer-text');
const queueList = document.getElementById('queue-list');
const loadingEl = document.getElementById('loading');
const loadStatusEl = document.getElementById('load-status');

async function init() {
  loadStatusEl.textContent = 'Building scene...';
  await initScene(document.getElementById('canvas-container'));

  loadStatusEl.textContent = 'Loading voice model...';
  await initTTS((status) => { loadStatusEl.textContent = status; });

  // Show "Enter" button and wait for click (unlocks audio)
  loadingEl.classList.add('ready');
  await new Promise(resolve => {
    document.getElementById('enter-btn').addEventListener('click', resolve, { once: true });
  });

  // Connect to WebSocket for live broadcast
  connect({
    onQueue: (queue) => {
      queueList.innerHTML = '';
      queue.forEach(q => {
        const el = document.createElement('div');
        el.className = 'queue-item';
        el.textContent = q.question;
        queueList.appendChild(el);
      });
    },
    onActive: (question, wallet) => {
      stopSpeaking();
      questionEl.textContent = `"${question}"`;
      questionEl.classList.add('visible');
      askerEl.textContent = shortenWallet(wallet);
      askerEl.classList.add('visible');
      answerEl.textContent = '';
      answerEl.classList.remove('visible');
    },
    onAnswer: (text) => {
      // Show text and speak it immediately — TTS is client-side now
      answerEl.textContent = text;
      answerEl.classList.add('visible');

      speak(text, {
        voice: 'am_michael',
        speed: 1.0,
        onViseme: (viseme, morphs) => {
          // Reset all mouth morphs, then apply current viseme
          for (const name of ALL_MOUTH_MORPHS) setMorph(name, 0);
          for (const [name, value] of Object.entries(morphs)) {
            setMorph(name, value);
          }
        },
        onDone: () => {
          // Reset mouth and fade out text
          for (const name of ALL_MOUTH_MORPHS) setMorph(name, 0);
          setTimeout(() => {
            questionEl.classList.remove('visible');
            askerEl.classList.remove('visible');
            answerEl.classList.remove('visible');
          }, 2000);
        },
      });
    },
    onDone: () => {},
    onStatus: () => {},
    onError: (msg) => {
      stopSpeaking();
      answerEl.textContent = msg;
      answerEl.classList.add('visible');
    },
  });

  // Hide loading
  loadingEl.classList.add('hidden');
  setTimeout(() => loadingEl.style.display = 'none', 800);
}

function shortenWallet(w) {
  if (!w || w === 'anonymous' || w.length < 12) return w;
  return `${w.slice(0, 6)}...${w.slice(-4)}`;
}

init().catch(console.error);
