/**
 * MPP Oracle Server
 *
 * Accepts $0.01 per question via MPP charge.
 * Queries OpenRouter LLM, generates TTS, broadcasts to all viewers.
 */
import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Mppx, tempo } from 'mppx/express';
import { privateKeyToAccount } from 'viem/accounts';
import { config } from './config.js';
import { initLLM, askLLM } from './llm.js';
import { enqueue, setProcessHandler, addWsClient, removeWsClient, broadcast } from './queue.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// Serve Vite-built static files in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

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
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  addWsClient(ws);
  ws.on('close', () => removeWsClient(ws));
});

// Refusal phrases the LLM uses for inappropriate questions
const REFUSAL_PHRASES = ["i won't answer", "not a worthy question", "i can't help with that",
  "i won't engage", "not going to answer", "i refuse", "that's not appropriate"];

function isRefusal(answer) {
  const lower = answer.toLowerCase();
  return REFUSAL_PHRASES.some(p => lower.includes(p));
}

// Process questions: LLM → broadcast text (client handles TTS)
setProcessHandler(async (item, broadcast) => {
  const { question, wallet } = item;
  console.log(`Processing: "${question}" from ${wallet}`);

  broadcast({ type: 'status', status: 'thinking' });
  const answer = await askLLM(question);
  console.log(`Answer: ${answer.slice(0, 80)}`);

  // Censor question if LLM refused to answer
  const displayQuestion = isRefusal(answer) ? '******' : question;
  broadcast({ type: 'active', question: displayQuestion, wallet });

  // Send text — client generates speech via WebGPU Kokoro
  broadcast({ type: 'answer', text: answer });
});

// SPA fallback — serve index.html for non-API routes
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// WebSocket heartbeat to keep connections alive on Railway
setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Start
async function start() {
  initLLM();

  const port = process.env.PORT || config.port;
  server.listen(port, '0.0.0.0', () => {
    console.log(`Oracle server listening on http://0.0.0.0:${port}`);
    console.log(`  POST /api/ask — $${config.questionPrice} per question`);
    console.log(`  WS   /ws      — live broadcast`);
  });
}

start().catch(console.error);
