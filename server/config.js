/**
 * Server configuration. Loaded from environment variables.
 */
import 'dotenv/config';

// For dev, load .env manually if dotenv not available
const env = process.env;

export const config = {
  port: parseInt(env.PORT || '3001'),

  // Oracle wallet
  oraclePrivateKey: env.ORACLE_PRIVATE_KEY,
  oracleAddress: env.ORACLE_ADDRESS,

  // MPP server
  mppSecretKey: env.MPP_SECRET_KEY,

  // Pricing
  questionPrice: '0.01', // $0.01 USDC
  currency: '0x20c000000000000000000000b9537d11c60e8b50', // USDC mainnet

  // OpenRouter
  openRouterUrl: 'https://openrouter.mpp.tempo.xyz/v1/chat/completions',
  model: 'openai/gpt-5.4-nano',
  systemPrompt: 'Answer in 1-2 short sentences. Be direct. No filler, no fluff. Never use markdown, asterisks, bullet points, or numbered lists. Use plain spoken language only.',

  // TTS
  ttsVoice: 'am_michael',
  ttsSpeed: 1.0,
};
