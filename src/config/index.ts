import dotenv from 'dotenv';

dotenv.config();

export const config = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  ALLOWED_USER_IDS: (process.env.ALLOWED_USER_IDS || '').split(',').map(id => id.trim()).filter(id => id.length > 0),
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || '',
  ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB', 
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || '',
  FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT || '',
  AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID || '',
  AZURE_TENANT_ID: process.env.AZURE_TENANT_ID || '',
  NODE_ENV: process.env.NODE_ENV || 'development',
  WEBHOOK_URL: process.env.WEBHOOK_URL || '',
};

export function validateConfig() {
  const isProd = config.NODE_ENV === 'production';
  
  if (!config.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is missing');
  if (!config.FIREBASE_PROJECT_ID) throw new Error('FIREBASE_PROJECT_ID is missing');
  
  if (!config.GROQ_API_KEY && !config.GEMINI_API_KEY) {
    throw new Error('No LLM API keys found (Groq or Gemini required)');
  }
}
