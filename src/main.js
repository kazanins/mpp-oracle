/**
 * MPP Oracle — public talking head that answers paid questions.
 */
import { initScene, setMorph } from './scene.js';
import { connect } from './ws-client.js';
import { playWithLipSync } from './audio-player.js';

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
      questionEl.textContent = `"${question}"`;
      questionEl.classList.add('visible');
      askerEl.textContent = shortenWallet(wallet);
      askerEl.classList.add('visible');
      answerEl.textContent = '';
      answerEl.classList.remove('visible');
    },
    onAnswer: (text) => {
      answerEl.textContent = text;
      answerEl.classList.add('visible');
    },
    onSpeak: async (audio, timeline, duration) => {
      await playWithLipSync(audio, timeline, setMorph);
    },
    onDone: () => {
      setTimeout(() => {
        questionEl.classList.remove('visible');
        askerEl.classList.remove('visible');
        answerEl.classList.remove('visible');
      }, 3000);
    },
    onStatus: () => {},
    onError: (msg) => {
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
