/**
 * LLM client — Oracle pays OpenRouter via mppx/client session.
 */
import { privateKeyToAccount } from 'viem/accounts';
import { Mppx, tempo } from 'mppx/client';
import { config } from './config.js';

let mppx = null;

export function initLLM() {
  const account = privateKeyToAccount(config.oraclePrivateKey);

  mppx = Mppx.create({
    polyfill: false,
    methods: [tempo({ account, maxDeposit: '1' })],
  });

  console.log('LLM client ready, Oracle wallet:', config.oracleAddress);
}

export async function askLLM(question) {
  if (!mppx) throw new Error('LLM not initialized');

  const response = await mppx.fetch(config.openRouterUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: config.systemPrompt },
        { role: 'user', content: question },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`LLM request failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}
