import { validateConfig } from './config/index.js';
import { initDb } from './db/index.js';
import { initLlm } from './llm/index.js';
import { initBot, startBot } from './bot/index.js';
import http from 'http';

let isInitialized = false;

async function initialize() {
  if (isInitialized) return;
  console.log('Initializing Hero Agent...');
  validateConfig();
  initDb();
  initLlm();
  initBot();
  startBot();
  isInitialized = true;
}

// The main handler for Vercel/Serverless
export default async (req: any, res: any) => {
  try {
    await initialize();
    const { handleWebhook } = await import('./bot/index.js');

    // Basic health check (only for GET requests)
    if (req.method === 'GET' && (req.url === '/' || req.url === '/health' || !req.url)) {
      // Force a re-registration of the webhook if it's missing or on every health check
      initBot();
      startBot();
      res.writeHead(200);
      res.end('Hero Agent is healthy and connected to Telegram!');
      return;
    }

    // Handle Telegram Webhook
    await handleWebhook(req, res);
  } catch (err: any) {
    console.error('Serverless execution error:', err);
    res.writeHead(500);
    res.end(`Internal Server Error: ${err.message}`);
  }
};

// Local bootstrap (when not on Vercel)
async function bootstrap() {
  if (process.env.VERCEL === '1') {
    console.log('Skipping local server listen (Vercel environment detected)');
    return;
  }

  try {
    const PORT = process.env.PORT || 8080;
    await initialize();
    const { handleWebhook } = await import('./bot/index.js');

    const server = http.createServer(async (req, res) => {
       // Health check
       if (req.url === '/' || req.url === '/health') {
         res.writeHead(200);
         res.end('Hero Agent is healthy');
         return;
       }
       // Webhook
       try {
         await handleWebhook(req, res);
       } catch (err) {
         console.error('Webhook error:', err);
         res.writeHead(500);
         res.end('Internal Server Error');
       }
    }).listen(PORT, () => console.log(`Server listening on port ${PORT}`));

    // Clean shutdown
    const shutdown = async (signal: string) => {
      console.log(`${signal} received. Shutting down...`);
      server.close();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
  } catch (err) {
    console.error('Failed to start Hero Agent locally:', err);
    process.exit(1);
  }
}

// Call bootstrap for local execution
bootstrap();
