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
  ws.send(JSON.stringify({ type: 'queue', queue: queue.map(q => ({ question: q.question, wallet: q.wallet })) }));
  if (processing && queue[0]) {
    ws.send(JSON.stringify({ type: 'active', question: queue[0].question, wallet: queue[0].wallet }));
  }
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
  broadcast({ type: 'queue', queue: queue.map(q => ({ question: q.question, wallet: q.wallet })) });
  processNext();
}

async function processNext() {
  if (processing || queue.length === 0 || !processHandler) return;
  processing = true;

  const item = queue[0];
  broadcast({ type: 'active', question: item.question, wallet: item.wallet });

  try {
    await processHandler(item, broadcast);
  } catch (err) {
    console.error('Error processing question:', err.message);
    broadcast({ type: 'error', message: 'The Oracle is momentarily silent.' });
  }

  queue.shift();
  processing = false;
  broadcast({ type: 'queue', queue: queue.map(q => ({ question: q.question, wallet: q.wallet })) });
  broadcast({ type: 'done' });

  // Process next in queue after a pause
  if (queue.length > 0) {
    setTimeout(processNext, 2000);
  }
}
