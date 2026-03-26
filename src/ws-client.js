/**
 * WebSocket client — connects to Oracle server for live broadcast.
 */

let ws = null;
let handlers = {};

export function connect(eventHandlers) {
  handlers = eventHandlers;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

  ws.onopen = () => {
    console.log('[WS] Connected');
    handlers.onStatus?.('Connected');
  };

  ws.onerror = (err) => console.error('[WS] Error:', err);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    console.log('[WS]', msg.type);
    switch (msg.type) {
      case 'queue':
        handlers.onQueue?.(msg.queue);
        break;
      case 'active':
        handlers.onActive?.(msg.question, msg.wallet);
        break;
      case 'answer':
        handlers.onAnswer?.(msg.text);
        break;
      case 'speak':
        handlers.onSpeak?.(msg.audio, msg.timeline, msg.duration);
        break;
      case 'status':
        handlers.onStatus?.(msg.status);
        break;
      case 'done':
        handlers.onDone?.();
        break;
      case 'error':
        handlers.onError?.(msg.message);
        break;
    }
  };

  ws.onclose = () => {
    handlers.onStatus?.('Disconnected');
    setTimeout(() => connect(handlers), 3000);
  };
}
