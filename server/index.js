/**
 * MPP Oracle Server
 *
 * Accepts $0.01 per question via MPP charge.
 * Queries OpenRouter LLM, generates TTS, broadcasts to all viewers.
 */
import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'node:http';
import { Mppx, tempo } from 'mppx/express';
import { privateKeyToAccount } from 'viem/accounts';
import { config } from './config.js';
import { initLLM, askLLM } from './llm.js';
import { initTTS, generateSpeech, audioToWav } from './tts.js';
import { enqueue, setProcessHandler, addWsClient, removeWsClient, broadcast } from './queue.js';

const app = express();
app.use(express.json());

// Oracle account for receiving payments
const oracleAccount = privateKeyToAccount(config.oraclePrivateKey);

// MPP payment gate — accepts charges for questions
const mppx = Mppx.create({
  secretKey: config.mppSecretKey,
  methods: [
    tempo({
      currency: config.currency,
      recipient: oracleAccount.address,
      account: oracleAccount,
    }),
  ],
});

// Free test endpoint (bypass payment)
app.post('/api/ask/test', (req, res) => {
  const { question } = req.body || {};
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return res.status(400).json({ error: 'Missing question' });
  }
  enqueue(question.trim(), 'test-user');
  res.json({ ok: true });
});

// Paid endpoint: submit a question ($0.01 charge)
app.post(
  '/api/ask',
  mppx.charge({ amount: config.questionPrice, description: 'Ask the Oracle a question' }),
  (req, res) => {
    const { question } = req.body || {};
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({ error: 'Missing question' });
    }

    // Extract payer wallet from the credential
    const auth = req.headers.authorization || '';
    let wallet = 'anonymous';
    try {
      // The credential source contains the payer's DID
      const parts = auth.split('.');
      if (parts.length > 0) {
        const decoded = JSON.parse(atob(parts[0]));
        wallet = decoded.source?.split(':').pop() || 'anonymous';
      }
    } catch {}

    enqueue(question.trim(), wallet);
    res.json({ ok: true, position: 0 }); // TODO: return actual queue position
  },
);

// Free endpoint: health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, queue: 0 });
});

// Create HTTP server
const server = http.createServer(app);

// WebSocket server for broadcasting
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  addWsClient(ws);
  ws.on('close', () => removeWsClient(ws));
});

// Process questions: LLM → TTS → broadcast
setProcessHandler(async (item, broadcast) => {
  const { question, wallet } = item;
  console.log(`Processing: "${question}" from ${wallet}`);

  // Get LLM answer
  broadcast({ type: 'status', status: 'thinking' });
  const answer = await askLLM(question);
  console.log(`Answer: ${answer.slice(0, 80)}`);

  // Show answer text immediately
  broadcast({ type: 'answer', text: answer });

  // Generate TTS
  broadcast({ type: 'status', status: 'speaking' });
  const speech = await generateSpeech(answer);

  // Convert to WAV and base64 for sending over WebSocket
  const wavBuffer = audioToWav(speech.audio, speech.sampleRate);
  const base64Audio = Buffer.from(wavBuffer).toString('base64');

  // Send audio + timeline to all clients
  broadcast({
    type: 'speak',
    audio: base64Audio,
    timeline: speech.timeline,
    duration: speech.duration,
  });
});

// Start
async function start() {
  await initTTS();
  initLLM();

  server.listen(config.port, () => {
    console.log(`Oracle server listening on http://localhost:${config.port}`);
    console.log(`  POST /api/ask — $${(parseInt(config.questionPrice) / 1e6).toFixed(2)} per question`);
    console.log(`  WS   /ws      — live broadcast`);
  });
}

start().catch(console.error);
