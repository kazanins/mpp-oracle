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

  // Buffer answer text until audio arrives, then show + play together
  let pendingAnswer = null;

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
      pendingAnswer = null;
    },
    onAnswer: (text) => {
      // Hold text until audio is ready
      pendingAnswer = text;
    },
    onSpeak: async (audio, timeline, duration) => {
      // Show text and play audio at the same time
      if (pendingAnswer) {
        answerEl.textContent = pendingAnswer;
        answerEl.classList.add('visible');
        pendingAnswer = null;
      }
      await playWithLipSync(audio, timeline, setMorph);
      // Audio finished — fade out after a beat
      setTimeout(() => {
        questionEl.classList.remove('visible');
        askerEl.classList.remove('visible');
        answerEl.classList.remove('visible');
      }, 2000);
    },
    onDone: () => {
      // If no audio was sent (error path), show any pending text then fade
      if (pendingAnswer) {
        answerEl.textContent = pendingAnswer;
        answerEl.classList.add('visible');
        pendingAnswer = null;
        setTimeout(() => {
          questionEl.classList.remove('visible');
          askerEl.classList.remove('visible');
          answerEl.classList.remove('visible');
        }, 5000);
      }
    },
    onStatus: () => {},
    onError: (msg) => {
      pendingAnswer = null;
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
