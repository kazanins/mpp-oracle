/**
 * Question queue — FIFO queue with broadcast to WebSocket clients.
 */

const queue = [];
let processing = false;
let processHandler = null;
let wsClients = new Set();

export function setProcessHandler(handler) {
  processHandler = handler;
}

export function addWsClient(ws) {
  wsClients.add(ws);
  // Send current state
  ws.send(JSON.stringify({ type: 'queue', queue: queue.map(() => ({ question: 'Awaiting the Oracle...' })) }));
}

export function removeWsClient(ws) {
  wsClients.delete(ws);
}

export function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of wsClients) {
    if (ws.readyState === 1) ws.send(data);
  }
}

export function enqueue(question, wallet) {
  queue.push({ question, wallet });
  broadcast({ type: 'queue', queue: queue.map(() => ({ question: 'Awaiting the Oracle...' })) });
  processNext();
}

async function processNext() {
  if (processing || queue.length === 0 || !processHandler) return;
  processing = true;

  const item = queue[0];

  try {
    await processHandler(item, broadcast);
  } catch (err) {
    console.error('Error processing question:', err.message);
    broadcast({ type: 'error', message: 'The Oracle is momentarily silent.' });
  }

  queue.shift();
  processing = false;
  broadcast({ type: 'queue', queue: queue.map(() => ({ question: 'Awaiting the Oracle...' })) });
  broadcast({ type: 'done' });

  // Process next in queue after a pause
  if (queue.length > 0) {
    setTimeout(processNext, 2000);
  }
}
